import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle, HttpError } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { postLoanInstallments } from '@/lib/loans';

/** تسجيل الصرف: approved → paid مع تصدير بنك جاهز */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    const { id } = await ctx.params;
    const period = await db.payrollPeriod.findUnique({
      where: { id },
      include: { payslips: { include: { employee: true } } },
    });
    if (!period) return fail(404, 'الفترة غير موجودة');
    if (period.status !== 'approved') return fail(400, 'اصرف فترة معتمدة فقط');

    // الصرف وترحيل أقساط السلف معًا — إما يتمان كلاهما أو لا شيء
    const loansPosted = await db.$transaction(async (tx) => {
      const res = await tx.payrollPeriod.updateMany({ where: { id, status: 'approved' }, data: { status: 'paid', paidAt: new Date() } });
      if (res.count === 0) throw new HttpError(409, 'تغيّرت حالة الفترة أثناء الصرف — حدّث الصفحة');
      await tx.payslip.updateMany({ where: { periodId: id }, data: { status: 'paid' } });
      return postLoanInstallments(tx, id, 1);
    });

    const total = period.payslips.reduce((s, p) => s + p.netPay, 0);
    await logAudit({
      userId: user.id, action: 'pay', entity: 'payroll-period', entityId: id,
      description: `صرف رواتب فترة ${period.name} (${period.payslips.length} موظفًا — ${total.toFixed(3)} د.ك — ترحيل ${loansPosted} قسط سلفة)`,
    });
    await createRestorePoint(user.id, `صرف رواتب ${period.name}`);
    return ok({ paid: true, total: Math.round(total * 1000) / 1000 });
  });
}
