import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

/** اعتماد/رفض/إلغاء طلب إجازة — HR أو مدير (قاعدة 12: الاعتماد يسري فورًا) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'leave-approve');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action;
    if (!['approve', 'reject', 'cancel'].includes(action || '')) {
      return fail(400, 'إجراء غير معروف — استخدم approve أو reject أو cancel');
    }
    if (action === 'approve' && !['admin', 'hr'].includes(user.role)) {
      return fail(403, 'اعتماد الإجازات حق لموارد البشرية أو المدير');
    }

    const existing = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true, leaveType: true } });
    if (!existing) return fail(404, 'الطلب غير موجود');
    if (existing.status !== 'pending') return fail(400, `الطلب بـحالة ${existing.status} — لا يمكن تغييره`);

    const statusMap: Record<string, string> = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' };
    const newStatus = statusMap[action!];

    await db.leaveRequest.update({
      where: { id },
      data: { status: newStatus, reviewedBy: user.id, reviewedAt: new Date() },
    });

    // إعادة معالجة الحضور لنطاق الإجازة فورًا (اعتماد → leave، رفض → يعود للحساب العادي)
    const today = dateKey();
    const fromKey = dateKey(existing.fromDate);
    const toKey = dateKey(existing.toDate) < today ? dateKey(existing.toDate) : today;
    await recomputeRange({ from: fromKey, to: toKey, employeeId: existing.employeeId }).catch(() => {});

    const actionAr = { approve: 'اعتماد', reject: 'رفض', cancel: 'إلغاء' }[action!];
    await logAudit({
      userId: user.id, action: action === 'approve' ? 'approve' : 'update', entity: 'leave', entityId: id,
      description: `${actionAr} طلب إجازة ${existing.leaveType.name} للموظف ${existing.employee.name} (${fromKey} → ${toKey})`,
    });
    await createRestorePoint(user.id, `${actionAr} طلب إجازة: ${existing.employee.name}`);
    return ok({ status: newStatus });
  });
}

/** حذف طلب معلق — HR أو مدير */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'leaves');
    const { id } = await ctx.params;
    const existing = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!existing) return fail(404, 'الطلب غير موجود');
    if (existing.status === 'approved') {
      return fail(400, 'لا يمكن حذف إجازة معتمدة — ألغِها ثم احذفها');
    }
    await db.leaveRequest.delete({ where: { id } });
    await logAudit({
      userId: user.id, action: 'delete', entity: 'leave', entityId: id,
      description: `حذف طلب إجازة للموظف ${existing.employee.name}`,
    });
    await createRestorePoint(user.id, 'حذف طلب إجازة');
    return ok({ deleted: true });
  });
}
