// lib/settlement.ts — بناء تفاصيل تسوية نهاية الخدمة الكاملة (مطابقة لنموذج التسوية النهائية)
// كشف مرتب + تعويض إجازات + مكافأة بشرائح بالأيام + تفصيل راتب المكافأة + قروض غير مسددة
import { db } from '@/lib/db';
import { round3 } from '@/lib/calc';
import { getSettings } from '@/lib/settings';
import {
  daysBetween, indemnitySlices, slicesExactTotal, servicePeriodPercent, parseResignTiers, capIndemnity,
  normalizeEosBasis, eosWage, fullWage, finalMonthSalary, settlementTotal, EosBasis,
} from '@/lib/indemnity';
import { vacationBalance } from '@/lib/vacation';
import { effectiveWorkDays } from '@/lib/workweek';
import { resolveShift } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

export interface SettlementDetailInput {
  employeeId: string;
  hireDate: Date | string | null;
  departureDate: Date | string;
  reason: string;
  lastWage?: number | null; // أجر المكافأة يدويًا — فارغ = يُحسب من العقد حسب الأساس
  eosBasis?: string | null; // basic|full_wage — فارغ = اختيار الموظف ثم افتراضي الشركة
  leaveAllowance?: unknown; // بدل الإجازات يدويًا — فارغ = يُحسب من الرصيد
  otherDues?: unknown;
  deductions?: unknown;
}

export interface SettlementDetail {
  slices: ReturnType<typeof indemnitySlices>;
  eosBasis: EosBasis;
  lastWage: number; // أجر المكافأة المستخدم
  monthlySalary: number; // الراتب الشهري الكامل (لراتب شهر الترك وتعويض الإجازات)
  indemnityFull: number; // مجموع الشرائح بالأيام بعد الحد الأقصى
  eosAmount: number; // بعد نسبة فترة الخدمة
  leaveAllowance: number; // بدل الإجازات النهائي (يدوي أو تعويض الرصيد تلقائيًا)
  otherDues: number;
  deductions: number;
  stbTotal: number;
  stbHousing: number; stbSocial: number; stbProvident: number; stbInsurance: number;
  vacationDays: number;
  vacationAmount: number;
  loanDeduction: number; // أقساط قروض غير مسددة
  daysPaid: number; // أيام العمل المدفوعة في شهر الترك
  worthSalary: number; // قيمتها
  servicePercent: number; // نسبة فترة الخدمة (٪) للاستقالة
  yearsServed: number;
  totalDays: number;
  totalDue: number;
}

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** تفاصيل كاملة للتسوية — تُخزن داخل سجل DepartureSettlement */
export async function buildSettlementDetail(input: SettlementDetailInput): Promise<SettlementDetail> {
  const settings = await getSettings();
  const emp = await db.employee.findUnique({
    where: { id: input.employeeId },
    include: { contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 } },
  });
  const c = emp?.contracts[0];
  const parts = {
    basic: c?.basicSalary ?? emp?.basicSalary ?? 0,
    housing: c?.housingAllowance ?? 0,
    transport: c?.transportAllowance ?? 0,
    other: c?.otherAllowance ?? 0,
  };

  // أساس المكافأة: اختيار التسوية ← اختيار الموظف ← افتراضي الشركة
  const chosen = input.eosBasis === 'basic' || input.eosBasis === 'full_wage' ? input.eosBasis : emp?.eosBasis;
  const basis = normalizeEosBasis(
    chosen,
    normalizeEosBasis(settings.eosBasisDefault),
  );
  const wage = !isBlank(input.lastWage) ? Math.max(0, Number(input.lastWage) || 0) : eosWage(parts, basis);
  const monthlySalary = fullWage(parts);

  const totalDays = input.hireDate ? daysBetween(input.hireDate, input.departureDate) : 0;
  const years = Math.round((totalDays / 365) * 100) / 100;

  // شرائح المكافأة بالأيام + الحد الأقصى (أجر 18 شهرًا)
  const slices = input.hireDate ? indemnitySlices(wage, input.hireDate, input.departureDate) : [];
  const indemnityExact = capIndemnity(slicesExactTotal(slices), wage);
  const indemnityFull = round3(indemnityExact);

  // نسبة فترة الخدمة (استقالة) من جداول قابلة للضبط
  const servicePercent = servicePeriodPercent(input.reason, years, parseResignTiers(settings.eosResignTiers));
  const eosAmount = round3(indemnityExact * (servicePercent / 100));

  // تفصيل راتب المكافأة — البدلات تظهر فقط إن كان الأساس يشملها
  const withAllowances = basis === 'full_wage' && isBlank(input.lastWage);
  const stbHousing = withAllowances ? round3(parts.housing) : 0;
  const stbSocial = withAllowances ? round3(parts.transport + parts.other) : 0;

  // أيام عمل الموظف (أيام راحته الخاصة ← ورديته)
  const depKey = dateKey(new Date(input.departureDate));
  const { shift } = await resolveShift(input.employeeId, depKey);
  const workDays = effectiveWorkDays(emp?.weeklyOffDays, shift?.workDays);

  // تعويض الإجازات: أيام الرصيد المتبقي × (الراتب الشهري ÷ أيام الشهر المعتمدة)
  const bal = await vacationBalance(input.employeeId, input.hireDate, settings.vacationAnnualQuota ?? 30, input.departureDate);
  const vacationDays = Math.max(0, bal.balance);
  const dayRate = settings.workDaysPerMonth > 0 ? monthlySalary / settings.workDaysPerMonth : 0;
  const vacationAmount = round3(vacationDays * dayRate);

  // أقساط القروض غير المسددة
  const loans = await db.loan.findMany({ where: { employeeId: input.employeeId, status: 'active' } });
  const loanDeduction = round3(loans.reduce((s, l) => s + Math.max(0, l.totalAmount - l.paidAmount), 0));

  // راتب شهر الترك بأيام العمل الفعلية
  const { daysPaid, worthSalary } = finalMonthSalary(
    monthlySalary, input.hireDate, input.departureDate, workDays, settings.workDaysPerMonth,
  );

  const leaveAllowance = !isBlank(input.leaveAllowance) ? Math.max(0, Number(input.leaveAllowance) || 0) : vacationAmount;
  const otherDues = Math.max(0, Number(input.otherDues) || 0);
  const deductions = Math.max(0, Number(input.deductions) || 0);

  const totalDue = settlementTotal({ worthSalary, eosAmount, leaveAllowance, otherDues, deductions, loanDeduction });

  return {
    slices,
    eosBasis: basis,
    lastWage: wage,
    monthlySalary,
    indemnityFull,
    eosAmount,
    leaveAllowance,
    otherDues,
    deductions,
    stbTotal: wage,
    stbHousing, stbSocial, stbProvident: 0, stbInsurance: 0,
    vacationDays,
    vacationAmount: leaveAllowance,
    loanDeduction,
    daysPaid,
    worthSalary,
    servicePercent,
    yearsServed: years,
    totalDays,
    totalDue,
  };
}
