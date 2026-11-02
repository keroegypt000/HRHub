// lib/time.ts — المنطقة الزمنية Asia/Kuwait (UTC+3 ثابت بلا توقيت صيفي) وتجاوز منتصف الليل

export const KUWAIT_OFFSET_MIN = 180; // UTC+3

/** تاريخ اليوم بصيغة YYYY-MM-DD بتوقيت الكويت */
export function dateKey(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const ms = dt.getTime() + KUWAIT_OFFSET_MIN * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** يحوّل نص تاريخ YYYY-MM-DD إلى لحظة منتصف الليل بتوقيت الكويت (21:00 UTC سابقًا) */
export function kuwaitMidnight(key: string): Date {
  // key = "YYYY-MM-DD"
  return new Date(`${key}T00:00:00.000+03:00`);
}

/** بداية اليوم بتوقيت الكويت لحظة معينة */
export function startOfDayKuwait(d: Date): Date {
  return kuwaitMidnight(dateKey(d));
}

/** نهاية اليوم (حصري) بتوقيت الكويت */
export function endOfDayKuwait(d: Date): Date {
  const s = startOfDayKuwait(d);
  return new Date(s.getTime() + 24 * 3600_000);
}

/** إضافة أيام على مفتاح تاريخ */
export function addDaysKey(key: string, days: number): string {
  const d = kuwaitMidnight(key);
  return dateKey(new Date(d.getTime() + days * 24 * 3600_000));
}

/** فرق الدقائق بين لحظتين */
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** تنسيق وقت HH:MM بتوقيت الكويت */
export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const ms = dt.getTime() + KUWAIT_OFFSET_MIN * 60_000;
  return new Date(ms).toISOString().slice(11, 16);
}

/** تنسيق تاريخ YYYY-MM-DD بتوقيت الكويت للعرض */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return dateKey(typeof d === 'string' ? new Date(d) : d);
}

/** تنسيق تاريخ ووقت للعرض */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${fmtDate(dt)} ${fmtTime(dt)}`;
}

/** رقم يوم الأسبوع 0=الأحد ... 6=السبت بتوقيت الكويت */
export function weekdayIndex(d: Date): number {
  const ms = d.getTime() + KUWAIT_OFFSET_MIN * 60_000;
  return new Date(ms).getUTCDay();
}

/** "HH:MM" → دقائق من منتصف الليل */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * لحظة حد boundary للوردية في يوم معين.
 * minutes تُحتسب من منتصف ليل اليوم؛ وإذا تجاوزت 1440 (وردية ليلية) تُكمَّل في اليوم التالي تلقائيًا.
 */
export function shiftMoment(dayStart: Date, minutes: number): Date {
  return new Date(dayStart.getTime() + minutes * 60_000);
}

/** نطاق يوم كامل [من، إلى) من مفتاح تاريخ */
export function dayRange(key: string): { from: Date; to: Date } {
  const from = kuwaitMidnight(key);
  return { from, to: new Date(from.getTime() + 24 * 3600_000) };
}

/** أول يوم من الشهر بصيغة YYYY-MM */
export function monthStartKey(name: string): string {
  return `${name}-01`;
}

/** عدد أيام الشهر (اسم الشهر YYYY-MM) */
export function daysInMonth(name: string): number {
  const [y, m] = name.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** كل مفاتيح أيام الشهر YYYY-MM */
export function monthDayKeys(name: string): string[] {
  const keys: string[] = [];
  const total = daysInMonth(name);
  for (let i = 1; i <= total; i++) keys.push(`${name}-${String(i).padStart(2, '0')}`);
  return keys;
}
