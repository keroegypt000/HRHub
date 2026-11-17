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

/**
 * ربط موظفين بوردية على كل سجلهم: تُستبدل كل وردياتهم السابقة بهذه الوردية
 * من أقدم تاريخ (أول بصمة / التعيين / أول وردية) — ثم يُعاد حساب كل السجل
 */
export async function assignWholeHistory(shiftId: string, employeeIds: string[]) {
  let added = 0; let moved = 0;
  for (const employeeId of [...new Set(employeeIds)]) {
    const [emp, firstLog, old] = await Promise.all([
      db.employee.findUnique({ where: { id: employeeId }, select: { hireDate: true } }),
      db.attendanceLog.findFirst({ where: { employeeId }, orderBy: { punchTime: 'asc' }, select: { punchTime: true } }),
      db.shiftAssignment.findMany({ where: { employeeId } }),
    ]);
    const starts = [emp?.hireDate, firstLog?.punchTime, ...old.map((o) => o.fromDate)].filter((d): d is Date => !!d).map((d) => dateKey(d));
    const start = starts.sort()[0] || dateKey();
    if (old.some((o) => o.shiftId !== shiftId)) moved++;
    await db.shiftAssignment.deleteMany({ where: { employeeId } });
    await db.shiftAssignment.create({ data: { employeeId, shiftId, fromDate: kuwaitMidnight(start), toDate: null } });
    added++;
  }
  return { added, unchanged: 0, moved };
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

/**
 * أول وردية للموظف تغطي كل تاريخه: لو مفيش وردية قبلها، تبدأ من أول بصمة أو تاريخ التعيين (الأقدم)
 * — حتى لا تبقى الأيام القديمة على الوردية الافتراضية. يرجع تاريخ البداية بعد التعديل.
 */
export async function backfillFirstAssignment(employeeId: string): Promise<string | null> {
  const list = await db.shiftAssignment.findMany({ where: { employeeId }, orderBy: { fromDate: 'asc' }, take: 1 });
  const first = list[0];
  if (!first) return null;
  const [emp, firstLog] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId }, select: { hireDate: true } }),
    db.attendanceLog.findFirst({ where: { employeeId }, orderBy: { punchTime: 'asc' }, select: { punchTime: true } }),
  ]);
  const candidates = [first.fromDate, emp?.hireDate, firstLog?.punchTime].filter((d): d is Date => !!d).map((d) => dateKey(d));
  const start = candidates.sort()[0];
  if (start < dateKey(first.fromDate)) {
    await db.shiftAssignment.update({ where: { id: first.id }, data: { fromDate: kuwaitMidnight(start) } });
  }
  return start;
}

/** إعادة حساب حضور موظفين من تاريخ حتى اليوم (كل الأيام بدون حد) */
export async function recalcEmployees(employeeIds: string[], fromKey: string) {
  const today = dateKey();
  let n = 0;
  for (let d = fromKey, g = 0; d <= today && g < 3700; d = addDaysKey(d, 1), g++) {
    for (const id of new Set(employeeIds)) { await computeDay(id, d); n++; }
  }
  return n;
}

/**
 * بعد تعديل الوردية أو ربط موظفين بها: كل موظف عليها يُعاد حساب كل سجله
 * من بداية ورديته (بعد مدّ أول وردية لأول بصمة) حتى اليوم
 */
export async function recalcShift(shiftId: string) {
  const members = await db.shiftAssignment.findMany({ where: { shiftId }, select: { employeeId: true } });
  for (const empId of new Set(members.map((m) => m.employeeId))) await recalcEmployeeHistory(empId);
}

/** إعادة حساب كل تاريخ موظف (من أقدم وردية/بصمة/تعيين) */
export async function recalcEmployeeHistory(employeeId: string) {
  const start = await backfillFirstAssignment(employeeId);
  const firstLog = await db.attendanceLog.findFirst({ where: { employeeId }, orderBy: { punchTime: 'asc' }, select: { punchTime: true } });
  const from = [start, firstLog ? dateKey(firstLog.punchTime) : null].filter((x): x is string => !!x).sort()[0];
  if (from) await recalcEmployees([employeeId], from);
}

/**
 * إصلاح البيانات القديمة (عند تشغيل البرنامج): أي موظف أول وردية له تبدأ بعد أول بصمة له
 * تُمد ورديته لأول بصمة ويُعاد حساب كل سجله — مرة واحدة فقط لأن الشرط لا يتكرر بعدها
 */
export async function fixHistoricalAssignments() {
  const firsts = await db.shiftAssignment.findMany({ orderBy: { fromDate: 'asc' }, select: { employeeId: true, fromDate: true } });
  const earliest = new Map<string, Date>();
  for (const a of firsts) if (!earliest.has(a.employeeId)) earliest.set(a.employeeId, a.fromDate);
  let fixed = 0;
  for (const [employeeId, from] of earliest) {
    const firstLog = await db.attendanceLog.findFirst({ where: { employeeId }, orderBy: { punchTime: 'asc' }, select: { punchTime: true } });
    if (firstLog && dateKey(firstLog.punchTime) < dateKey(from)) { await recalcEmployeeHistory(employeeId); fixed++; }
  }
  return fixed;
}

/** تشغيل في الخلفية بدون تعطيل الرد */
export function inBackground(task: Promise<unknown>) { task.catch((e) => console.error('[recalc]', e)); }
