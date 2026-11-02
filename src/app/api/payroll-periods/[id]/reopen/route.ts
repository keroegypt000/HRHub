import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';

/** إعادة فتح فترة محسوبة/معتمدة/مصروفة → draft — للمدير فقط ويُسجل في التدقيق (قاعدة 13) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    if (user.role !== 'admin') {
      return fail(403, 'إعادة فتح فترة حق للمدير فقط');
    }
    const { id } = await ctx.params;
    const period = await db.payrollPeriod.findUnique({ where: { id } });
    if (!period) return fail(404, 'الفترة غير موجودة');
    if (period.status === 'draft') {
      return fail(400, 'الفترة مسودة بالفعل — احسبها مباشرة');
    }
    await db.payrollPeriod.update({ where: { id }, data: { status: 'draft', approvedBy: null, approvedAt: null, paidAt: null } });
    await db.payslip.updateMany({ where: { periodId: id }, data: { status: 'draft' } });
    await logAudit({
      userId: user.id, action: 'reopen', entity: 'payroll-period', entityId: id,
      description: `إعادة فتح فترة رواتب ${period.name} (كانت ${period.status}) — تتيح إعادة الحساب`,
    });
    return ok({ reopened: true });
  });
}
