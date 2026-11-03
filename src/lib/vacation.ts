// lib/vacation.ts — رصيد الإجازات المتراكم + تسوية الإجازة المقدمة
// النموذج المرجعي: Vacation In-Advance Settlement (مطابق لتقارير المني تك)
// - الرصيد المتراكم = (حصة السنة × أيام الخدمة ÷ 365) − الإجازات المعتمدة المستخدمة
// - تسوية المقدّم: توزيع أيام الإجازة على الأشهر + قيمة اليوم = الأساسي ÷ أيام العمل بالشهر

import { daysBetween } from '@/lib/indemnity';
import { dateKey, monthDayKeys, kuwaitMidnight, weekdayIndex } from '@/lib/time';
import { db } from '@/lib/db';
import { round3 } from '@/lib/calc';

export interface VacationBalance {
  accrued: number; // المتراكم حتى تاريخ معين
  used: number; // المستخدم (إجازات معتمدة)
  balance: number; // المتراكم − المستخدم
  annualQuota: number; // حصة السنة
}

/** رصيد إجازة موظف حتى تاريخ معين (افتراضيًا اليوم) */
export async function vacationBalance(
  employeeId: string,
  hireDate: Date | string | null | undefined,
  annualQuota: number,
  asOf: Date | string = new Date(),
): Promise<VacationBalance> {
  if (!hireDate) return { accrued: 0, used: 0, balance: 0, annualQuota };
  const servedDays = daysBetween(hireDate, asOf);
  const accrued = round3((annualQuota * Math.max(0, servedDays)) / 365);
  const usedRows = await db.leaveRequest.findMany({
    where: { employeeId, status: 'approved', leaveType: { paid: true, code: { in: ['annual', 'ANNUAL'] } } },
    select: { days: true },
  });
  // إن لم توجد نوع سنوي بالكود المحدد اعتبر كل الإجازات المدفوعة مستهلكة من الرصيد
  let used: number;
  if (usedRows.length) {
    used = round3(usedRows.reduce((s, r) => s + Number(r.days), 0));
  } else {
    const paidRows = await db.leaveRequest.findMany({
      where: { employeeId, status: 'approved', leaveType: { paid: true } },
      select: { days: true },
    });
    used = round3(paidRows.reduce((s, r) => s + Number(r.days), 0));
  }
  return { accrued, used, balance: round3(accrued - used), annualQuota };
}

export interface VacationMonthRow {
  month: string; // 2026-06
  workingDays: number; // أيام عمل قبل بدء الإجازة داخل الشهر
  workingAmount: number;
  vacationDays: number; // أيام إجازة في الشهر
  vacationAmount: number;
}

export interface VacationAdvanceResult {
  rows: VacationMonthRow[];
  workingDaysTotal: number;
  workingAmountTotal: number;
  vacationDaysTotal: number;
  vacationAmountTotal: number;
  advanceTotal: number; // إجمالي المقدّم = عمل + إجازة
}

/**
 * تفصيل تسوية الإجازة المقدمة شهريًا:
 * - اليوم = الأساسي ÷ أيام العمل بالشهر (26 افتراضيًا — مطابق للنموذج: 115/26)
 * - أيام الإجازة توزَّع على الأشهر حسب أيام الفترة غير الراحة الأسبوعية،
 *   وتُضبط بإجمالي أيام الإجازة (days) — وأيام العمل = أيام الفترة قبل بداية الإجازة الفعلية
 *   (تُستنتج عكسيًا: من نهاية الفترة ترجع days أيام إجازة، وما قبلها أيام عمل/راحة).
 */
export function vacationAdvanceBreakdown(
  fromDate: Date | string,
  toDate: Date | string,
  leaveDays: number,
  basicSalary: number,
  workDaysPerMonth: number,
  workDaysOfWeek: number[] = [0, 1, 2, 3, 4], // 0=الأحد — أيام عمل الأسبوع
): VacationAdvanceResult {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const dayRate = workDaysPerMonth > 0 ? basicSalary / workDaysPerMonth : 0;

  // مفاتيح الأيام داخل الفترة
  const keys: string[] = [];
  const cursor = new Date(`${dateKey(from)}T00:00:00.000+03:00`);
  const endKey = dateKey(to);
  while (dateKey(cursor) <= endKey && keys.length < 400) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // إجازة فعلية = آخر leaveDays يوم عمل (غير راحة أسبوعية) داخل الفترة
  const workdayKeys = keys.filter((k) => workDaysOfWeek.includes(weekdayIndex(kuwaitMidnight(k))));
  const leaveKeys = new Set(workdayKeys.slice(Math.max(0, workdayKeys.length - Math.round(leaveDays))));

  // توزيع على الأشهر
  const byMonth = new Map<string, { work: number; leave: number }>();
  for (const k of keys) {
    const m = k.slice(0, 7);
    const rec = byMonth.get(m) || { work: 0, leave: 0 };
    if (leaveKeys.has(k)) rec.leave += 1;
    else if (workDaysOfWeek.includes(weekdayIndex(kuwaitMidnight(k)))) rec.work += 1;
    byMonth.set(m, rec);
  }

  // تكييس أيام الإجازة الكلية على months بالترتيب (لضمان المجموع = leaveDays)
  const rows: VacationMonthRow[] = [];
  const months = [...byMonth.keys()].sort();
  let leavePool = Math.round(leaveDays * 1000) / 1000;
  for (const m of months) {
    const rec = byMonth.get(m)!;
    let vacation = rec.leave;
    if (leavePool < rec.leave) vacation = Math.max(0, leavePool);
    leavePool = round3(leavePool - vacation);
    const monthKeys = monthDayKeys(m);
    const rateBase = monthKeys.length === 0 ? workDaysPerMonth : workDaysPerMonth;
    rows.push({
      month: m,
      workingDays: rec.work,
      workingAmount: round3(rec.work * (basicSalary / rateBase)),
      vacationDays: Math.round(vacation * 1000) / 1000,
      vacationAmount: round3(vacation * (basicSalary / rateBase)),
    });
  }

  const workingDaysTotal = round3(rows.reduce((s, r) => s + r.workingDays, 0));
  const workingAmountTotal = round3(rows.reduce((s, r) => s + r.workingAmount, 0));
  const vacationDaysTotal = round3(rows.reduce((s, r) => s + r.vacationDays, 0));
  const vacationAmountTotal = round3(rows.reduce((s, r) => s + r.vacationAmount, 0));
  return {
    rows,
    workingDaysTotal,
    workingAmountTotal,
    vacationDaysTotal,
    vacationAmountTotal,
    advanceTotal: round3(workingAmountTotal + vacationAmountTotal),
  };
}
