// lib/vacation.ts — رصيد الإجازات المتراكم + تسوية الإجازة المقدمة
// النموذج المرجعي: Vacation In-Advance Settlement (مطابق لتقارير المني تك)
// - الرصيد المتراكم = (حصة السنة × أيام الخدمة ÷ 365) − الإجازات المعتمدة المستخدمة
// - تسوية المقدّم: أيام عمل الموظف داخل الفترة موزعة على الأشهر بسقف 26 يوم/شهر + قيمة اليوم = الأساسي ÷ 26

import { daysBetween } from '@/lib/indemnity';
import { dateKey, addDaysKey, kuwaitMidnight, weekdayIndex } from '@/lib/time';
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
  workingDays: number; // أيام عمل قبل بدء الإجازة داخل الشهر (تُصرف مقدمًا)
  workingAmount: number;
  vacationDays: number; // أيام إجازة في الشهر (بحد أقصى أيام الشهر المعتمدة)
  vacationAmount: number;
}

export interface VacationAdvanceResult {
  rows: VacationMonthRow[];
  periodDays: number; // أيام الإجازة الفعلية (أيام عمل الموظف داخل الفترة)
  workingDaysTotal: number;
  workingAmountTotal: number;
  vacationDaysTotal: number;
  vacationAmountTotal: number;
  advanceTotal: number; // إجمالي المقدّم = عمل + إجازة
}

/**
 * تفصيل تسوية الإجازة المقدمة شهريًا — مطابق لنموذج Vacation In-Advance Settlement:
 * - قيمة اليوم = الأساسي ÷ أيام الشهر المعتمدة (26) — 115 ÷ 26
 * - أيام الإجازة = أيام عمل الموظف داخل الفترة (تُستبعد أيام راحته الأسبوعية فقط)
 * - كل شهر بحد أقصى 26 يومًا = راتب شهر كامل (يوليو 27 يوم → 26 = 115.000)
 * - أيام العمل قبل بداية الإجازة في شهر البداية تُصرف مقدمًا مع الإجازة
 */
export function vacationAdvanceBreakdown(
  fromDate: Date | string,
  toDate: Date | string,
  basicSalary: number,
  workDaysPerMonth: number,
  workDaysOfWeek: number[],
  hireDate?: Date | string | null,
): VacationAdvanceResult {
  const base = workDaysPerMonth > 0 ? workDaysPerMonth : 26;
  const rate = basicSalary / base;
  const isWorkday = (k: string) => workDaysOfWeek.includes(weekdayIndex(kuwaitMidnight(k)));

  const fromKey = dateKey(new Date(fromDate));
  const toKey = dateKey(new Date(toDate));

  // أيام الإجازة لكل شهر
  const leaveByMonth = new Map<string, number>();
  let periodDays = 0;
  for (let k = fromKey, guard = 0; k <= toKey && guard < 800; k = addDaysKey(k, 1), guard++) {
    if (!isWorkday(k)) continue;
    periodDays++;
    leaveByMonth.set(k.slice(0, 7), (leaveByMonth.get(k.slice(0, 7)) || 0) + 1);
  }

  // أيام العمل في شهر البداية قبل الإجازة (من بداية الشهر أو التعيين)
  let workStart = `${fromKey.slice(0, 7)}-01`;
  if (hireDate) {
    const hk = dateKey(new Date(hireDate));
    if (hk > workStart) workStart = hk;
  }
  let workBefore = 0;
  for (let k = workStart; k < fromKey; k = addDaysKey(k, 1)) if (isWorkday(k)) workBefore++;

  const months = [...new Set([fromKey.slice(0, 7), ...leaveByMonth.keys()])].sort();
  const rows: VacationMonthRow[] = months.map((m) => {
    const working = m === fromKey.slice(0, 7) ? workBefore : 0;
    const leave = leaveByMonth.get(m) || 0;
    // سقف الشهر: أيام العمل + الإجازة لا تتجاوز 26 يومًا (راتب شهر كامل)
    const vacation = Math.min(leave, Math.max(0, base - working));
    return {
      month: m,
      workingDays: working,
      workingAmount: round3(working * rate),
      vacationDays: vacation,
      vacationAmount: round3(vacation * rate),
    };
  });

  const workingDaysTotal = rows.reduce((s, r) => s + r.workingDays, 0);
  const workingAmountTotal = round3(rows.reduce((s, r) => s + r.workingAmount, 0));
  const vacationDaysTotal = rows.reduce((s, r) => s + r.vacationDays, 0);
  const vacationAmountTotal = round3(rows.reduce((s, r) => s + r.vacationAmount, 0));
  return {
    rows,
    periodDays,
    workingDaysTotal,
    workingAmountTotal,
    vacationDaysTotal,
    vacationAmountTotal,
    advanceTotal: round3(workingAmountTotal + vacationAmountTotal),
  };
}
