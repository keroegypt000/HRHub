import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

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

    await db.payrollPeriod.update({ where: { id }, data: { status: 'paid', paidAt: new Date() } });
    await db.payslip.updateMany({ where: { periodId: id }, data: { status: 'paid' } });

    const total = period.payslips.reduce((s, p) => s + p.netPay, 0);
    await logAudit({
      userId: user.id, action: 'pay', entity: 'payroll-period', entityId: id,
      description: `صرف رواتب فترة ${period.name} (${period.payslips.length} موظفًا — ${total.toFixed(3)} د.ك)`,
    });
    await createRestorePoint(user.id, `صرف رواتب ${period.name}`);
    return ok({ paid: true, total: Math.round(total * 1000) / 1000 });
  });
}
