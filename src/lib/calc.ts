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
  const hr = hourRate(basic, s);
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
