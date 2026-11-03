import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { dateKey } from '@/lib/time';

/** اعتماد الفترة: computed → approved — قفل نهائي (قاعدة 13) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    if (!['admin', 'accountant'].includes(user.role)) {
      return fail(403, 'الاعتماد حق للمدير أو المحاسب');
    }
    const { id } = await ctx.params;
    const period = await db.payrollPeriod.findUnique({ where: { id } });
    if (!period) return fail(404, 'الفترة غير موجودة');
    if (period.status !== 'computed') return fail(400, 'اعتمد فترة محسوبة فقط — احسبها أولًا');
    if (dateKey(period.endDate) > dateKey()) {
      return fail(400, `الفترة لم تنتهِ بعد — الحساب الحالي جزئي حتى اليوم، ويمكن اعتمادها بعد ${dateKey(period.endDate)}`);
    }

    const slips = await db.payslip.count({ where: { periodId: id } });
    if (slips === 0) return fail(400, 'لا توجد قسائم في الفترة — احسبها أولًا');

    await db.payrollPeriod.update({
      where: { id },
      data: { status: 'approved', approvedBy: user.id, approvedAt: new Date() },
    });
    await db.payslip.updateMany({ where: { periodId: id, status: 'draft' }, data: { status: 'approved' } });
    await logAudit({
      userId: user.id, action: 'approve', entity: 'payroll-period', entityId: id,
      description: `اعتماد فترة رواتب ${period.name} (${slips} قسيمة) — الفترة مقفلة الآن`,
    });
    return ok({ approved: true });
  });
}
