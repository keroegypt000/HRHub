// lib/indemnity.ts — حساب مكافأة نهاية الخدمة والمستحقات
// المرجع: قانون العمل الكويتي رقم 6 لسنة 2010 (المواد 47-53)
// المادة 47: نصف شهر لكل سنة من السنوات الخمس الأولى + شهر لكل سنة بعدها، والكسور تُحسب بنفس النسبة
// المادة 49: عند الاستقالة: أقل من 3 سنوات لا شيء | 3-5 سنوات الثلث | 5-10 سنوات النصف | 10+ كاملة
// المادة 53: الوفاة: المكافأة كاملة للمستحقين (الورثة)

export const INDEMNITY_LAW = 'قانون العمل الكويتي رقم 6 لسنة 2010';

export const DEPARTURE_REASONS = [
  { value: 'resigned', label: 'استقالة', ar: 'استقالة' },
  { value: 'terminated', label: 'إنهاء خدمات من الشركة', ar: 'إنهاء خدمات' },
  { value: 'retired', label: 'تقاعد', ar: 'تقاعد' },
  { value: 'deceased', label: 'وفاة', ar: 'وفاة' },
  { value: 'contract_end', label: 'انتهاء عقد', ar: 'انتهاء عقد' },
] as const;

export type DepartureReason = (typeof DEPARTURE_REASONS)[number]['value'];

export function reasonLabel(reason: string): string {
  return DEPARTURE_REASONS.find((r) => r.value === reason)?.ar || reason;
}

/** عدد سنوات الخدمة بين تاريخين (بالكسر العشري) */
export function yearsServed(hireDate: Date | string | null | undefined, endDate: Date | string): number {
  if (!hireDate) return 0;
  const h = new Date(hireDate).getTime();
  const e = new Date(endDate).getTime();
  if (!Number.isFinite(h) || !Number.isFinite(e) || e < h) return 0;
  return Math.round(((e - h) / (365.25 * 24 * 3600_000)) * 100) / 100;
}

/** المكافأة الكاملة قبل معامل السبب (المادة 47) */
export function indemnityFull(lastWage: number, years: number): number {
  if (!lastWage || lastWage <= 0 || years <= 0) return 0;
  const first = Math.min(years, 5);
  const rest = Math.max(years - 5, 0);
  const months = first * 0.5 + rest * 1.0;
  return Math.round(lastWage * months * 1000) / 1000;
}

/** معامل الاستحقاق حسب السبب (المادة 49 للاستقالة، والباقي كاملة) */
export function reasonFactor(reason: string, years: number): number {
  if (reason === 'resigned') {
    if (years < 3) return 0;
    if (years < 5) return 1 / 3;
    if (years < 10) return 0.5;
    return 1;
  }
  // إنهاء من الشركة / تقاعد / وفاة / انتهاء عقد → كاملة
  return 1;
}

// ===== شرائح المكافأة بالأيام (مطابقة لنماذج التسويات) =====
// المكافأة تُحسب على أساس الأيام: (الراتب × أيام الفترة ÷ 365) × نسبة الشريحة
// الشريحة 1 (أول 5 سنوات): 15/26 لكل يوم = 57.692% — الشريحة 2 (ما بعد 5 سنوات): 26/26 = 100%
export const SLICE1_PERCENT = 15 / 26; // 57.692%
export const SLICE2_PERCENT = 1; // 26/26
const FIVE_YEARS_DAYS = 5 * 365;

export function daysBetween(from: Date | string, to: Date | string): number {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0;
  return Math.round((t - f) / (24 * 3600_000)) + 1; // عدّ شامل للطرفين — مطابق لنماذج التسويات (1355 يوم للعينة)
}

export function addDays(from: Date | string, days: number): Date {
  return new Date(new Date(from).getTime() + days * 24 * 3600_000);
}

export interface IndemnitySlice {
  from: string; // YYYY-MM-DD
  to: string;
  slice: number; // رقم الشريحة
  workingDays: number;
  stbDays: number; // أيام المكافأة (= أيام العمل هنا)
  percent: number; // نسبة الشريحة (0.576923 أو 1)
  amount: number; // (الراتب × الأيام ÷ 365) × النسبة
}

/**
 * شرائح حساب المكافأة بالأيام — بنفس أسلوب تقارير نهاية الخدمة:
 * سنوات كاملة أولًا (365 يوم) بعامل 15/26 ضمن أول 5 سنوات، ثم الكسر،
 * وما بعد 5 سنوات بعامل كامل (شهر لكل سنة).
 * المجموع يطابق indemnityFull مع دقة أعلى (حساب بالأيام لا بالسنوات العشرية).
 */
export function indemnitySlices(lastWage: number, hireDate: Date | string, endDate: Date | string): IndemnitySlice[] {
  const wage = Number(lastWage) || 0;
  const total = daysBetween(hireDate, endDate);
  if (!wage || wage <= 0 || total <= 0) return [];

  const amount = (days: number, pct: number) => Math.round(((wage * days) / 365) * pct * 1000) / 1000;
  const slices: IndemnitySlice[] = [];
  let sliceNo = 1;

  if (total <= FIVE_YEARS_DAYS) {
    // سنوات كاملة (كل 365 يوم) ثم الكسر — كلها بعامل 15/26
    const fullYears = Math.floor(total / 365);
    const fullDays = fullYears * 365;
    const fracDays = total - fullDays;
    if (fullDays > 0) {
      slices.push({
        from: keyOf(hireDate), to: keyOf(addDays(hireDate, fullDays - 1)),
        slice: sliceNo++, workingDays: fullDays, stbDays: fullDays,
        percent: SLICE1_PERCENT, amount: amount(fullDays, SLICE1_PERCENT),
      });
    }
    if (fracDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, fullDays)), to: keyOf(endDate),
        slice: sliceNo++, workingDays: fracDays, stbDays: fracDays,
        percent: SLICE1_PERCENT, amount: amount(fracDays, SLICE1_PERCENT),
      });
    }
  } else {
    // أول 5 سنوات بعامل 15/26 ثم الباقي بعامل كامل (شهر لكل سنة)
    slices.push({
      from: keyOf(hireDate), to: keyOf(addDays(hireDate, FIVE_YEARS_DAYS - 1)),
      slice: sliceNo++, workingDays: FIVE_YEARS_DAYS, stbDays: FIVE_YEARS_DAYS,
      percent: SLICE1_PERCENT, amount: amount(FIVE_YEARS_DAYS, SLICE1_PERCENT),
    });
    const rest = total - FIVE_YEARS_DAYS;
    const fullYears = Math.floor(rest / 365);
    const fullDays = fullYears * 365;
    const fracDays = rest - fullDays;
    if (fullDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, FIVE_YEARS_DAYS)), to: keyOf(addDays(hireDate, FIVE_YEARS_DAYS + fullDays - 1)),
        slice: sliceNo++, workingDays: fullDays, stbDays: fullDays,
        percent: SLICE2_PERCENT, amount: amount(fullDays, SLICE2_PERCENT),
      });
    }
    if (fracDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, FIVE_YEARS_DAYS + fullDays)), to: keyOf(endDate),
        slice: sliceNo++, workingDays: fracDays, stbDays: fracDays,
        percent: SLICE2_PERCENT, amount: amount(fracDays, SLICE2_PERCENT),
      });
    }
  }
  return slices;
}

function keyOf(d: Date | string): string {
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

/** مجموع الشرائح — المكافأة الكاملة بالأيام (أدق من حساب السنوات العشرية) */
export function indemnityFullByDays(lastWage: number, hireDate: Date | string, endDate: Date | string): number {
  return Math.round(indemnitySlices(lastWage, hireDate, endDate).reduce((s, x) => s + x.amount, 0) * 1000) / 1000;
}

/**
 * نسب فترة الخدمة للاستقالة — قابلة للضبط من الإعدادات (نموذج المني تك: Service Period Percent).
 * الافتراضي قانون العمل الكويتي المادة 49. كل صف: {minYears, percent}
 */
export const DEFAULT_RESIGN_TIERS = [
  { minYears: 10, percent: 100 },
  { minYears: 5, percent: 50 },
  { minYears: 3, percent: 33.333 },
  { minYears: 0, percent: 0 },
];

export function parseResignTiers(json: string | null | undefined): { minYears: number; percent: number }[] {
  if (!json) return DEFAULT_RESIGN_TIERS;
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length && arr.every((x: { minYears?: unknown; percent?: unknown }) =>
      typeof x?.minYears === 'number' && typeof x?.percent === 'number')) {
      return [...arr].sort((a, b) => b.minYears - a.minYears);
    }
  } catch {}
  return DEFAULT_RESIGN_TIERS;
}

/** نسبة فترة الخدمة من جداول قابلة للضبط (للاستقالة) — أكبر حد يحققه عدد السنوات */
export function servicePeriodPercent(reason: string, years: number, tiers: { minYears: number; percent: number }[] = DEFAULT_RESIGN_TIERS): number {
  if (reason !== 'resigned') return 100;
  const sorted = [...tiers].sort((a, b) => b.minYears - a.minYears);
  for (const t of sorted) {
    if (years >= t.minYears) return t.percent;
  }
  return 0;
}

export interface EosCalcInput {
  hireDate: Date | string | null | undefined;
  endDate: Date | string;              // تاريخ النهاية (اليوم للموظف النشط)
  lastWage: number;                    // آخر أجر شهري
  reason: string;                      // resigned|terminated|retired|deceased|contract_end
  leaveAllowance?: number;
  otherDues?: number;
  deductions?: number;
}

export interface EosCalcResult {
  years: number;
  indemnityFull: number;
  factor: number;
  eosAmount: number;
  leaveAllowance: number;
  otherDues: number;
  deductions: number;
  totalDue: number;
  law: string;
  note: string;
}

/** الحساب الكامل الموحد — يُستخدم في الواجهة والـAPI */
export function calcEos(input: EosCalcInput): EosCalcResult {
  const years = yearsServed(input.hireDate, input.endDate);
  const wage = Number(input.lastWage) || 0;
  const full = indemnityFull(wage, years);
  const factor = reasonFactor(input.reason, years);
  const eos = Math.round(full * factor * 1000) / 1000;
  const leave = Math.max(0, Number(input.leaveAllowance) || 0);
  const other = Math.max(0, Number(input.otherDues) || 0);
  const ded = Math.max(0, Number(input.deductions) || 0);
  const total = Math.round((eos + leave + other - ded) * 1000) / 1000;

  let note = '';
  if (input.reason === 'resigned') {
    if (years < 3) note = 'استقالة قبل إكمال 3 سنوات — لا تستحق مكافأة (المادة 49)';
    else if (years < 5) note = 'استقالة بعد 3 سنوات فأقل من 5 — يستحق ثلث المكافأة (المادة 49)';
    else if (years < 10) note = 'استقالة بعد 5 سنوات فأقل من 10 — يستحق نصف المكافأة (المادة 49)';
    else note = 'استقالة بعد 10 سنوات — يستحق المكافأة كاملة (المادة 49)';
  } else if (input.reason === 'deceased') {
    note = 'الوفاة: المكافأة كاملة للمستحقين (المادة 53)';
  } else {
    note = 'المكافأة كاملة حسب المادة 47';
  }

  return {
    years, indemnityFull: full, factor, eosAmount: eos,
    leaveAllowance: leave, otherDues: other, deductions: ded, totalDue: total,
    law: INDEMNITY_LAW, note,
  };
}

/** حالة التسوية من المبلغ المدفوع */
export function settlementStatus(totalDue: number, paidAmount: number): 'pending' | 'partial' | 'paid' {
  if (paidAmount <= 0) return 'pending';
  if (paidAmount + 0.0005 >= totalDue) return 'paid';
  return 'partial';
}
