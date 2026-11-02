import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** تفاصيل فترة مع قسائمها */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'payroll-periods');
    const { id } = await ctx.params;
    const period = await db.payrollPeriod.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            // بنود القسيمة ضرورية للطباعة والتفصيل — بدونها تقع واجهة الطباعة
            items: { orderBy: { id: 'asc' } },
            employee: { select: { id: true, name: true, code: true, department: true, position: true, bankAccount: true, nationality: true, civilId: true } },
          },
          orderBy: { employeeId: 'asc' },
        },
      },
    });
    if (!period) return fail(404, 'الفترة غير موجودة');
    return ok(period);
  });
}

/** تعديل ملاحظات الفترة فقط — لا حذف فترة عليها قسائم معتمدة */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { notes?: string };
    const existing = await db.payrollPeriod.findUnique({ where: { id } });
    if (!existing) return fail(404, 'الفترة غير موجودة');
    const updated = await db.payrollPeriod.update({ where: { id }, data: { notes: body.notes ?? existing.notes } });
    await logAudit({ userId: user.id, action: 'update', entity: 'payroll-period', entityId: id, description: `تعديل فترة رواتب: ${existing.name}` });
    return ok(updated);
  });
}

/** حذف فترة draft فقط */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    const { id } = await ctx.params;
    const existing = await db.payrollPeriod.findUnique({ where: { id } });
    if (!existing) return fail(404, 'الفترة غير موجودة');
    if (existing.status !== 'draft') {
      return fail(400, 'لا يمكن حذف فترة محسوبة أو معتمدة أو مصروفة');
    }
    await db.payrollPeriod.delete({ where: { id } });
    await logAudit({ userId: user.id, action: 'delete', entity: 'payroll-period', entityId: id, description: `حذف فترة رواتب: ${existing.name}` });
    await createRestorePoint(user.id, `حذف فترة رواتب ${existing.name}`);
    return ok({ deleted: true });
  });
}
