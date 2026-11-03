// lib/workweek.ts — أيام العمل/الراحة الأسبوعية لكل موظف (0=الأحد ... 6=السبت)
// الأولوية: أيام راحة الموظف (weeklyOffDays) ← أيام عمل ورديته ← الافتراضي

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_WORK_DAYS = [0, 1, 2, 3, 4];
export const WEEKDAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** قائمة أيام من JSON — null إن كانت فارغة أو غير صالحة */
export function parseDayList(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const days = [...new Set(arr.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return days;
  } catch {
    return null;
  }
}

/** أيام العمل الفعلية للموظف: أيام راحته الخاصة تتقدم على وردية */
export function effectiveWorkDays(
  employeeOffDays: string | null | undefined,
  shiftWorkDays: string | null | undefined,
): number[] {
  const off = parseDayList(employeeOffDays);
  if (off) return ALL_WEEKDAYS.filter((d) => !off.includes(d));
  return parseDayList(shiftWorkDays) ?? DEFAULT_WORK_DAYS;
}

/** نص أيام الراحة للعرض */
export function offDaysText(json: string | null | undefined): string {
  const off = parseDayList(json);
  if (!off) return '';
  return off.map((d) => WEEKDAY_NAMES_AR[d]).join('، ');
}

/** خيارات يوم الراحة في نموذج الموظف — «shift» = حسب وردية الموظف */
export const WEEKLY_OFF_OPTIONS: { value: string; label: string }[] = [
  { value: 'shift', label: 'حسب وردية الموظف' },
  ...WEEKDAY_NAMES_AR.map((name, d) => ({ value: JSON.stringify([d]), label: name })),
  { value: '[5,6]', label: 'الجمعة والسبت' },
  { value: '[4,5]', label: 'الخميس والجمعة' },
  { value: '[]', label: 'بدون راحة أسبوعية' },
];
