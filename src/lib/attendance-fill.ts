// حساب أيام الحضور الناقصة قبل عرض التقارير/الشاشات — حتى يظهر كل الموظفين (الغائب بدون بصمة أيضًا)
import { db } from '@/lib/db';
import { computeDay } from '@/lib/attendance';
import { kuwaitMidnight, dateKey, addDaysKey } from '@/lib/time';

/** يحسب أيام الحضور الناقصة لكل الموظفين النشطين في الفترة (بحد أقصى حتى لا يبطئ التقرير) */
export async function ensureComputed(from: string, to: string, empWhere: Record<string, unknown>) {
  if (from > to) return;
  const emps = await db.employee.findMany({
    where: { ...empWhere, status: { not: 'terminated' } },
    select: { id: true, hireDate: true },
  });
  if (!emps.length) return;
  const existing = await db.dailyAttendance.findMany({
    where: { employeeId: { in: emps.map((e) => e.id) }, date: { gte: kuwaitMidnight(from), lte: kuwaitMidnight(to) } },
    select: { employeeId: true, date: true },
  });
  const have = new Set(existing.map((r) => `${r.employeeId}|${dateKey(r.date)}`));
  let budget = 20000;
  for (let d = from, g = 0; d <= to && g < 400; d = addDaysKey(d, 1), g++) {
    for (const e of emps) {
      if (e.hireDate && dateKey(e.hireDate) > d) continue;
      if (have.has(`${e.id}|${d}`)) continue;
      if (--budget < 0) return;
      await computeDay(e.id, d);
    }
  }
}
