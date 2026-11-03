// lib/calc.ts — الحسابات المالية بالدينار الكويتي (3 خانات عشرية) والمعادلات المشتركة

/** تقريب موحد ثلاث خانات في كل خطوة — قاعدة العمل رقم 1 */
export function round3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/** تنسيق مبلغ بالدينار الكويتي مع 3 خانات */
export function fmtKWD(n: number | null | undefined): string {
  const v = round3(Number(n || 0));
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export interface RateSettings {
  workDaysPerMonth: number; // 26 افتراضيًا
  hoursPerDay: number; // 8
  otWeekdayMult: number; // 1.25
  otHolidayMult: number; // 1.5
  lateDeductionMode: 'minute' | 'none'; // أجر الدقيقة × الدقائق
}

export const DEFAULT_RATES: RateSettings = {
  workDaysPerMonth: 26,
  hoursPerDay: 8,
  otWeekdayMult: 1.25,
  otHolidayMult: 1.5,
  lateDeductionMode: 'minute',
};

/** أجر الساعة = الأساسي ÷ أيام العمل ÷ ساعات اليوم */
export function hourRate(basic: number, s: Partial<RateSettings> = {}): number {
  const r = { ...DEFAULT_RATES, ...s };
  const days = r.workDaysPerMonth > 0 ? r.workDaysPerMonth : 26;
  const hours = r.hoursPerDay > 0 ? r.hoursPerDay : 8;
  return round3(basic / days / hours);
}

/** أجر الدقيقة */
export function minuteRate(basic: number, s: Partial<RateSettings> = {}): number {
  return round3(hourRate(basic, s) / 60);
}

/** أجر اليوم = الأساسي ÷ أيام العمل */
export function dayRate(basic: number, s: Partial<RateSettings> = {}): number {
  const r = { ...DEFAULT_RATES, ...s };
  const days = r.workDaysPerMonth > 0 ? r.workDaysPerMonth : 26;
  return round3(basic / days);
}

/** قيمة العمل الإضافي: دقائق عادية × 1.25 + دقائق عطلة/راحة × 1.5 */
export function otAmount(
  basic: number,
  weekdayOtMinutes: number,
  holidayOtMinutes: number,
  s: Partial<RateSettings> = {}
): number {
  const r = { ...DEFAULT_RATES, ...s };
  // أجر الساعة بلا تقريب وسيط — التقريب مرة واحدة على الناتج
  const hr = basic / (r.workDaysPerMonth > 0 ? r.workDaysPerMonth : 26) / (r.hoursPerDay > 0 ? r.hoursPerDay : 8);
  return round3(
    round3((weekdayOtMinutes / 60) * hr * r.otWeekdayMult) +
      round3((holidayOtMinutes / 60) * hr * r.otHolidayMult)
  );
}

/** نسبة مئوية من الأساسي */
export function percentOfBasic(pct: number, basic: number): number {
  return round3((pct / 100) * basic);
}

/** وضع آمن للأرقام القادمة من نماذج */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** خصم التأخير بالدقائق: الأساسي ÷ أيام الشهر ÷ ساعات اليوم ÷ 60 × الدقائق (تقريب مرة واحدة) */
export function lateDeductionAmount(basic: number, lateMinutes: number, s: Partial<RateSettings> = {}): number {
  const r = { ...DEFAULT_RATES, ...s };
  if (r.lateDeductionMode !== 'minute' || lateMinutes <= 0) return 0;
  const days = r.workDaysPerMonth > 0 ? r.workDaysPerMonth : 26;
  const hours = r.hoursPerDay > 0 ? r.hoursPerDay : 8;
  return round3((basic / days / hours / 60) * lateMinutes);
}

export interface AttendancePayInput {
  monthlyFixed: number; // الراتب الشهري الثابت: الأساسي + البدلات الثابتة
  monthWorkDays: number; // أيام عمل الموظف في الشهر كاملًا (حسب أيام راحته)
  employedWorkDays: number; // منها: الأيام داخل فترة عمله (بعد التعيين وقبل ترك العمل)
  absentDays: number; // غياب بلا إذن
  unpaidLeaveDays: number; // إجازة بدون راتب معتمدة
}

export interface AttendancePayResult {
  dayValue: number; // قيمة اليوم = الراتب الشهري ÷ أيام عمل الشهر
  notEmployedDays: number;
  notEmployedDeduction: number; // أيام قبل التعيين / بعد ترك العمل
  absenceDeduction: number;
  unpaidDeduction: number;
  paidDays: number; // الأيام المستحقة فعليًا
  payable: number; // الراتب الثابت المستحق بعد الخصومات (لا يقل عن صفر)
}

/**
 * الراتب حسب الحضور — قاعدة واحدة واضحة:
 * المستحق = الراتب الشهري × (أيام العمل داخل فترة التعيين − الغياب − الإجازة بدون راتب) ÷ أيام عمل الشهر
 * غياب الشهر كله = صفر، والمعيَّن في منتصف الشهر يأخذ نصيب أيامه فقط، والخصومات لا تتجاوز الراتب.
 * الخصم يشمل البدلات الثابتة (لا تُصرف بدلات عن أيام لم يعملها).
 */
export function attendancePay(x: AttendancePayInput): AttendancePayResult {
  const S = x.monthWorkDays > 0 ? x.monthWorkDays : 26;
  const E = Math.min(S, Math.max(0, x.employedWorkDays));
  const dayValue = x.monthlyFixed / S;
  const notEmployedDays = S - E;
  let remaining = x.monthlyFixed;
  const take = (days: number) => {
    const amount = Math.min(remaining, round3(dayValue * Math.max(0, days)));
    remaining = round3(remaining - amount);
    return amount;
  };
  const notEmployedDeduction = take(notEmployedDays);
  const absenceDeduction = take(x.absentDays);
  const unpaidDeduction = take(x.unpaidLeaveDays);
  return {
    dayValue: round3(dayValue),
    notEmployedDays,
    notEmployedDeduction,
    absenceDeduction,
    unpaidDeduction,
    paidDays: Math.max(0, E - x.absentDays - x.unpaidLeaveDays),
    payable: remaining,
  };
}
