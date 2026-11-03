import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shift-assignments');
    const { id } = await ctx.params;
    const existing = await db.shiftAssignment.findUnique({ where: { id }, include: { shift: true, employee: true } });
    if (!existing) return fail(404, 'التوزيعة غير موجودة');
    await db.shiftAssignment.delete({ where: { id } });
    await recomputeRange({ from: dateKey(existing.fromDate), to: dateKey(), employeeId: existing.employeeId }).catch(() => {});
    await logAudit({
      userId: user.id, action: 'delete', entity: 'shift-assignment', entityId: id,
      description: `حذف توزيعة وردية «${existing.shift?.name}» عن ${existing.employee?.name}`,
    });
    await createRestorePoint(user.id, 'حذف توزيعة وردية');
    return ok({ deleted: true });
  });
}
