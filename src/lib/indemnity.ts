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
