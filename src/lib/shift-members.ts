// lib/shift-members.ts — ربط الموظفين بالورديات (من داخل الوردية)
// القاعدة: لكل موظف وردية واحدة سارية في أي يوم. عند نقله لوردية جديدة تنتهي ورديته السابقة يوم قبل البداية.
import { db } from '@/lib/db';
import { kuwaitMidnight, dateKey } from '@/lib/time';

const DAY = 86400_000;

/** التوزيعة السارية اليوم لكل موظف (أحدث بداية لا تتجاوز اليوم ولم تنتهِ) */
export async function activeAssignments(employeeIds?: string[]) {
  const today = kuwaitMidnight(dateKey());
  const rows = await db.shiftAssignment.findMany({
    where: {
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      OR: [{ toDate: null }, { toDate: { gte: today } }],
    },
    orderBy: { fromDate: 'desc' },
    include: { shift: { select: { id: true, name: true } } },
  });
  // التوزيعة المستقبلية (تبدأ بعد اليوم) تظهر أيضًا — الأحدث بداية يمثل وردية الموظف
  const byEmp = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byEmp.has(r.employeeId)) byEmp.set(r.employeeId, r);
  return byEmp;
}

/**
 * ربط موظفين بوردية من تاريخ معين:
 * - تُنهى أي توزيعة سابقة مفتوحة لهم يوم قبل البداية (أو تُحذف لو كانت تبدأ في نفس اليوم أو بعده)
 * - من هو على نفس الوردية فعلًا لا يتغير
 */
export async function assignEmployees(shiftId: string, employeeIds: string[], fromKey: string, toKey?: string | null) {
  const from = kuwaitMidnight(fromKey);
  const to = toKey ? kuwaitMidnight(toKey) : null;
  const dayBefore = new Date(from.getTime() - DAY);
  const current = await activeAssignments(employeeIds);
  let added = 0; let unchanged = 0; let moved = 0;
  for (const employeeId of [...new Set(employeeIds)]) {
    const cur = current.get(employeeId);
    if (cur && cur.shiftId === shiftId && cur.fromDate <= from && !cur.toDate && !to) { unchanged++; continue; }
    // إنهاء/استبدال التوزيعات المتداخلة مع الفترة الجديدة
    const overlapping = await db.shiftAssignment.findMany({
      where: { employeeId, OR: [{ toDate: null }, { toDate: { gte: from } }] },
    });
    for (const o of overlapping) {
      if (o.fromDate >= from) await db.shiftAssignment.delete({ where: { id: o.id } });
      else await db.shiftAssignment.update({ where: { id: o.id }, data: { toDate: dayBefore } });
      if (o.shiftId !== shiftId) moved++;
    }
    await db.shiftAssignment.create({ data: { employeeId, shiftId, fromDate: from, toDate: to } });
    added++;
  }
  return { added, unchanged, moved };
}

/** إخراج موظف من الوردية من تاريخ (الحضور السابق يبقى محسوبًا على الوردية) */
export async function endAssignment(assignmentId: string, endKey: string) {
  const a = await db.shiftAssignment.findUnique({ where: { id: assignmentId } });
  if (!a) return null;
  const end = new Date(kuwaitMidnight(endKey).getTime() - DAY); // آخر يوم على الوردية = اليوم السابق
  if (a.fromDate > end) await db.shiftAssignment.delete({ where: { id: a.id } });
  else await db.shiftAssignment.update({ where: { id: a.id }, data: { toDate: end } });
  return a;
}
