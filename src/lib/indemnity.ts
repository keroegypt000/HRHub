// lib/indemnity.ts — حساب مكافأة نهاية الخدمة والمستحقات
// المرجع: قانون العمل الكويتي رقم 6 لسنة 2010 (المواد 47-53)
// المادة 51: 15 يومًا لكل سنة من السنوات الخمس الأولى + شهر لكل سنة بعدها، والكسور بنفس النسبة،
//            وبحد أقصى أجر سنة ونصف (18 شهرًا)
// المادة 51 (الاستقالة): أقل من 3 سنوات لا شيء | 3-5 سنوات النصف | 5-10 سنوات الثلثان | 10+ كاملة
// الوفاة/إنهاء الخدمة من صاحب العمل: المكافأة كاملة
import { addDaysKey, dateKey, kuwaitMidnight, weekdayIndex } from '@/lib/time';

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

/** الحد الأقصى للمكافأة بالأشهر — أجر سنة ونصف (المادة 51) */
export const EOS_MAX_MONTHS = 18;

/** تطبيق الحد الأقصى: لا تتجاوز المكافأة أجر 18 شهرًا */
export function capIndemnity(amount: number, monthlyWage: number): number {
  const cap = Math.round(monthlyWage * EOS_MAX_MONTHS * 1000) / 1000;
  return monthlyWage > 0 ? Math.min(amount, cap) : amount;
}

/** المكافأة الكاملة قبل معامل السبب (15/26 من الأجر لكل سنة من أول 5 ثم أجر شهر) — بالحد الأقصى */
export function indemnityFull(lastWage: number, years: number): number {
  if (!lastWage || lastWage <= 0 || years <= 0) return 0;
  const first = Math.min(years, 5);
  const rest = Math.max(years - 5, 0);
  const months = first * SLICE1_PERCENT + rest * SLICE2_PERCENT;
  return capIndemnity(Math.round(lastWage * months * 1000) / 1000, lastWage);
}

/** معامل الاستحقاق حسب السبب (المادة 51 للاستقالة، والباقي كاملة) */
export function reasonFactor(reason: string, years: number): number {
  return servicePeriodPercent(reason, years) / 100;
}

// ===== شرائح المكافأة بالأيام (مطابقة لنماذج التسويات) =====
// المكافأة تُحسب على أساس الأيام: (الراتب × أيام الفترة ÷ 365) × نسبة الشريحة
// الشريحة 1 (أول 5 سنوات): 15/26 لكل يوم = 57.692% — الشريحة 2 (ما بعد 5 سنوات): 26/26 = 100%
export const SLICE1_PERCENT = 0.57692; // 15/26 مقربة إلى 57.692% كما في تقارير MenaITech
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
  amount: number; // (الراتب × الأيام ÷ 365) × النسبة — مقربة للعرض
  exact?: number; // القيمة بلا تقريب — المجموع يُحسب منها ثم يُقرب مرة واحدة
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

  const exactOf = (days: number, pct: number) => ((wage * days) / 365) * pct;
  const amount = (days: number, pct: number) => Math.round(exactOf(days, pct) * 1000) / 1000;
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
        percent: SLICE1_PERCENT, amount: amount(fullDays, SLICE1_PERCENT), exact: exactOf(fullDays, SLICE1_PERCENT),
      });
    }
    if (fracDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, fullDays)), to: keyOf(endDate),
        slice: sliceNo++, workingDays: fracDays, stbDays: fracDays,
        percent: SLICE1_PERCENT, amount: amount(fracDays, SLICE1_PERCENT), exact: exactOf(fracDays, SLICE1_PERCENT),
      });
    }
  } else {
    // أول 5 سنوات بعامل 15/26 ثم الباقي بعامل كامل (شهر لكل سنة)
    slices.push({
      from: keyOf(hireDate), to: keyOf(addDays(hireDate, FIVE_YEARS_DAYS - 1)),
      slice: sliceNo++, workingDays: FIVE_YEARS_DAYS, stbDays: FIVE_YEARS_DAYS,
      percent: SLICE1_PERCENT, amount: amount(FIVE_YEARS_DAYS, SLICE1_PERCENT), exact: exactOf(FIVE_YEARS_DAYS, SLICE1_PERCENT),
    });
    const rest = total - FIVE_YEARS_DAYS;
    const fullYears = Math.floor(rest / 365);
    const fullDays = fullYears * 365;
    const fracDays = rest - fullDays;
    if (fullDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, FIVE_YEARS_DAYS)), to: keyOf(addDays(hireDate, FIVE_YEARS_DAYS + fullDays - 1)),
        slice: sliceNo++, workingDays: fullDays, stbDays: fullDays,
        percent: SLICE2_PERCENT, amount: amount(fullDays, SLICE2_PERCENT), exact: exactOf(fullDays, SLICE2_PERCENT),
      });
    }
    if (fracDays > 0) {
      slices.push({
        from: keyOf(addDays(hireDate, FIVE_YEARS_DAYS + fullDays)), to: keyOf(endDate),
        slice: sliceNo++, workingDays: fracDays, stbDays: fracDays,
        percent: SLICE2_PERCENT, amount: amount(fracDays, SLICE2_PERCENT), exact: exactOf(fracDays, SLICE2_PERCENT),
      });
    }
  }
  return slices;
}

function keyOf(d: Date | string): string {
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

/** مجموع الشرائح بلا تقريب — يُقرب مرة واحدة في النهاية (مطابق لـ MenaITech: 417.635 ثم 208.817) */
export function slicesExactTotal(slices: IndemnitySlice[]): number {
  return slices.reduce((s, x) => s + (x.exact ?? x.amount), 0);
}

/** مجموع الشرائح — المكافأة الكاملة بالأيام (أدق من حساب السنوات العشرية) */
export function indemnityFullByDays(lastWage: number, hireDate: Date | string, endDate: Date | string): number {
  return Math.round(slicesExactTotal(indemnitySlices(lastWage, hireDate, endDate)) * 1000) / 1000;
}

/**
 * نسب فترة الخدمة للاستقالة — قابلة للضبط من الإعدادات (نموذج المني تك: Service Period Percent).
 * الافتراضي قانون العمل الكويتي المادة 49. كل صف: {minYears, percent}
 */
export const DEFAULT_RESIGN_TIERS = [
  { minYears: 10, percent: 100 },
  { minYears: 5, percent: 66.667 },
  { minYears: 3, percent: 50 },
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
    if (years < 3) note = 'استقالة قبل إكمال 3 سنوات — لا تستحق مكافأة (المادة 51)';
    else if (years < 5) note = 'استقالة بعد 3 سنوات فأقل من 5 — يستحق نصف المكافأة (المادة 51)';
    else if (years < 10) note = 'استقالة بعد 5 سنوات فأقل من 10 — يستحق ثلثي المكافأة (المادة 51)';
    else note = 'استقالة بعد 10 سنوات — يستحق المكافأة كاملة (المادة 51)';
  } else if (input.reason === 'deceased') {
    note = 'الوفاة: المكافأة كاملة للمستحقين';
  } else {
    note = 'المكافأة كاملة حسب المادة 51';
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

// ===== أساس المكافأة: الأساسي فقط أو الأساسي + البدلات (اختيار الشركة/الموظف) =====
export const EOS_BASIS_OPTIONS = [
  { value: 'basic', label: 'الراتب الأساسي فقط' },
  { value: 'full_wage', label: 'الأساسي + البدلات (سكن/مواصلات/أخرى)' },
] as const;
export type EosBasis = (typeof EOS_BASIS_OPTIONS)[number]['value'];

export function normalizeEosBasis(v: unknown, fallback: EosBasis = 'basic'): EosBasis {
  return v === 'basic' || v === 'full_wage' ? v : fallback;
}

export interface WageParts { basic: number; housing: number; transport: number; other: number }

/** الأجر الشهري الكامل (الأساسي + كل البدلات) */
export function fullWage(w: WageParts): number {
  return Math.round(((w.basic || 0) + (w.housing || 0) + (w.transport || 0) + (w.other || 0)) * 1000) / 1000;
}

/** أجر المكافأة حسب الأساس المختار */
export function eosWage(w: WageParts, basis: EosBasis): number {
  return basis === 'full_wage' ? fullWage(w) : Math.round((w.basic || 0) * 1000) / 1000;
}

// ===== أيام العمل وراتب شهر الترك =====

/** عدد أيام العمل (حسب أيام عمل الموظف) بين تاريخين شاملين */
export function workingDaysBetween(from: Date | string, to: Date | string, workDays: number[]): number {
  let key = dateKey(new Date(from));
  const endKey = dateKey(new Date(to));
  let n = 0;
  while (key <= endKey) {
    if (workDays.includes(weekdayIndex(kuwaitMidnight(key)))) n++;
    key = addDaysKey(key, 1);
  }
  return n;
}

/**
 * راتب شهر الترك: أيام العمل من بداية الشهر (أو التعيين) حتى تاريخ الترك × (الراتب ÷ أيام الشهر المعتمدة)
 * بحد أقصى راتب شهر كامل — مطابق لنموذج التسوية (23 يوم × 195 ÷ 26 = 172.500)
 */
export function finalMonthSalary(
  monthlyWage: number,
  hireDate: Date | string | null | undefined,
  departureDate: Date | string,
  workDays: number[],
  workDaysPerMonth: number,
): { daysPaid: number; worthSalary: number } {
  const depKey = dateKey(new Date(departureDate));
  let fromKey = `${depKey.slice(0, 7)}-01`;
  if (hireDate) {
    const hireKey = dateKey(new Date(hireDate));
    if (hireKey > depKey) return { daysPaid: 0, worthSalary: 0 };
    if (hireKey > fromKey) fromKey = hireKey;
  }
  const base = workDaysPerMonth > 0 ? workDaysPerMonth : 26;
  const daysPaid = Math.min(base, workingDaysBetween(kuwaitMidnight(fromKey), kuwaitMidnight(depKey), workDays));
  const worthSalary = Math.min(monthlyWage, Math.round((monthlyWage / base) * daysPaid * 1000) / 1000);
  return { daysPaid, worthSalary };
}

export interface SettlementTotalsInput {
  worthSalary: number;   // راتب شهر الترك
  eosAmount: number;     // المكافأة بعد نسبة فترة الخدمة
  leaveAllowance: number; // تعويض الإجازات
  otherDues: number;
  deductions: number;
  loanDeduction: number; // أقساط قروض غير مسددة
  custodyDeduction?: number; // عهد لم تُسلَّم أو فُقدت
}

/** صافي التسوية = راتب الشهر + المكافأة + تعويض الإجازات + مستحقات أخرى − استقطاعات − قروض − العهد غير المسلَّمة */
export function settlementTotal(x: SettlementTotalsInput): number {
  const t = x.worthSalary + x.eosAmount + x.leaveAllowance + x.otherDues - x.deductions - x.loanDeduction - (x.custodyDeduction || 0);
  return Math.round(t * 1000) / 1000;
}

/** خصم العهد في التسوية: المسلَّمة غير المُعادة بقيمتها، والمفقودة/التالفة بمبلغ الخصم (أو قيمتها) */
export function custodyDeductionOf(items: { status: string; value: number; deductionAmount: number }[]): number {
  const t = items.reduce((s, c) => {
    if (c.status === 'issued') return s + (c.value || 0);
    if (c.status === 'lost' || c.status === 'damaged') return s + (c.deductionAmount > 0 ? c.deductionAmount : c.value || 0);
    return s;
  }, 0);
  return Math.round(t * 1000) / 1000;
}
