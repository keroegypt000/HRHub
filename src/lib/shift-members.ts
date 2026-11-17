// lib/shift-members.ts — ربط الموظفين بالورديات (من داخل الوردية)
// القاعدة: لكل موظف وردية واحدة سارية في أي يوم. عند نقله لوردية جديدة تنتهي ورديته السابقة يوم قبل البداية.
import { db } from '@/lib/db';
import { kuwaitMidnight, dateKey, addDaysKey } from '@/lib/time';
import { computeDay } from '@/lib/attendance';

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

/** أقصى عدد أيام يُعاد حسابها تلقائيًا بعد تعديل الوردية أو توزيع الموظفين */
const RECALC_DAYS = 120;

/** إعادة حساب حضور موظفين من تاريخ حتى اليوم (بحد أقصى 120 يومًا للخلف) */
export async function recalcEmployees(employeeIds: string[], fromKey: string) {
  const today = dateKey();
  const floor = addDaysKey(today, -RECALC_DAYS);
  let d = fromKey < floor ? floor : fromKey;
  let n = 0;
  for (; d <= today; d = addDaysKey(d, 1)) for (const id of new Set(employeeIds)) { await computeDay(id, d); n++; }
  return n;
}

/** بعد تعديل الوردية (السماحية، المواعيد...): إعادة حساب كل الأيام المحسوبة عليها في آخر 120 يوم */
export async function recalcShift(shiftId: string) {
  const since = kuwaitMidnight(addDaysKey(dateKey(), -RECALC_DAYS));
  const rows = await db.dailyAttendance.findMany({ where: { shiftId, date: { gte: since } }, select: { employeeId: true, date: true } });
  const members = await db.shiftAssignment.findMany({
    where: { shiftId, OR: [{ toDate: null }, { toDate: { gte: since } }] }, select: { employeeId: true, fromDate: true },
  });
  const seen = new Set<string>();
  for (const r of rows) { const k = `${r.employeeId}|${dateKey(r.date)}`; if (!seen.has(k)) { seen.add(k); await computeDay(r.employeeId, dateKey(r.date)); } }
  for (const m of members) await recalcEmployees([m.employeeId], dateKey(m.fromDate));
}

/** تشغيل في الخلفية بدون تعطيل الرد */
export function inBackground(task: Promise<unknown>) { task.catch((e) => console.error('[recalc]', e)); }
