// lib/leaves.ts — إنشاء طلبات الإجازة بقاعدة موحدة (شاشة الإجازات + سلسلة الموافقات)
// أيام الإجازة = أيام عمل الموظف داخل الفترة (تُستبعد أيام راحته الأسبوعية) — مطابق لـ Period في النموذج
import { db } from '@/lib/db';
import { HttpError } from '@/lib/api';
import { resolveShift } from '@/lib/attendance';
import { workingDaysBetween } from '@/lib/indemnity';
import { effectiveWorkDays } from '@/lib/workweek';
import { dateKey } from '@/lib/time';

export interface CreateLeaveInput {
  employeeId: string;
  leaveTypeId: string;
  from: Date;
  to: Date;
  reason?: string | null;
  status?: 'pending' | 'approved';
  reviewedBy?: string | null;
}

/** عدد أيام الإجازة الفعلية للموظف بين تاريخين */
export async function leaveWorkingDays(employeeId: string, weeklyOffDays: string | null, from: Date, to: Date): Promise<number> {
  const { shift } = await resolveShift(employeeId, dateKey(from));
  return workingDaysBetween(from, to, effectiveWorkDays(weeklyOffDays, shift?.workDays));
}

/** إنشاء طلب إجازة بعد التحقق من التداخل مع إجازة قائمة */
export async function createLeaveRequest(input: CreateLeaveInput) {
  if (input.from > input.to) throw new HttpError(400, 'تاريخ البداية يجب أن يسبق النهاية');
  const emp = await db.employee.findUnique({ where: { id: input.employeeId } });
  if (!emp) throw new HttpError(404, 'الموظف غير موجود');
  const lt = await db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!lt) throw new HttpError(404, 'نوع الإجازة غير موجود');

  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ['pending', 'approved'] },
      fromDate: { lte: input.to },
      toDate: { gte: input.from },
    },
  });
  if (overlap) {
    throw new HttpError(400, `يوجد طلب إجازة متداخل لنفس الموظف (${dateKey(overlap.fromDate)} → ${dateKey(overlap.toDate)})`);
  }

  const days = await leaveWorkingDays(emp.id, emp.weeklyOffDays, input.from, input.to);
  if (days <= 0) throw new HttpError(400, 'الفترة المختارة كلها أيام راحة للموظف');

  const created = await db.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.from,
      toDate: input.to,
      days,
      reason: input.reason || null,
      status: input.status || 'pending',
      reviewedBy: input.reviewedBy || null,
      reviewedAt: input.status === 'approved' ? new Date() : null,
    },
    include: { employee: true, leaveType: true },
  });
  return { created, emp, lt, days };
}
