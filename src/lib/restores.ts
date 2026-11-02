// lib/restores.ts — نقاط الاستعادة التلقائية: لقطة JSON للأقسام الأساسية بعد كل كتابة
import { db } from '@/lib/db';

/** إنشاء لقطة للأقسام الأساسية (يُستدعى بعد كل كتابة من الواجهة) */
export async function createRestorePoint(
  userId: string | null | undefined,
  description: string
): Promise<string> {
  const [departments, positions, employees, contracts, shifts, shiftAssignments, leaveTypes, leaves, holidays, devices, salaryComponents] =
    await Promise.all([
      db.department.findMany(),
      db.position.findMany(),
      db.employee.findMany({ select: { id: true, code: true, name: true, departmentId: true, positionId: true, basicSalary: true, status: true, pin: true, civilId: true } }),
      db.contract.findMany(),
      db.shift.findMany(),
      db.shiftAssignment.findMany(),
      db.leaveType.findMany(),
      db.leaveRequest.findMany(),
      db.holiday.findMany(),
      db.device.findMany(),
      db.salaryComponent.findMany(),
    ]);

  const snapshot = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    departments, positions, employees, contracts, shifts, shiftAssignments,
    leaveTypes, leaves, holidays, devices, salaryComponents,
  });

  const rp = await db.restorePoint.create({
    data: { userId: userId || null, description, snapshot },
  });
  // نحافظ على آخر 30 نقطة فقط
  const old = await db.restorePoint.findMany({
    orderBy: { createdAt: 'desc' },
    skip: 30,
    select: { id: true },
  });
  if (old.length) {
    await db.restorePoint.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
  return rp.id;
}
