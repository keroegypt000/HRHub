// lib/settlement.ts — بناء تفاصيل تسوية نهاية الخدمة الكاملة (مطابقة لنموذج التسوية النهائية)
// كشف مرتب + تعويض إجازات + مكافأة بشرائح بالأيام + تفصيل راتب المكافأة + قروض غير مسددة
import { db } from '@/lib/db';
import { round3 } from '@/lib/calc';
import { getSettings } from '@/lib/settings';
import { daysBetween, indemnitySlices, servicePeriodPercent, parseResignTiers } from '@/lib/indemnity';
import { vacationBalance } from '@/lib/vacation';

export interface SettlementDetailInput {
  employeeId: string;
  hireDate: Date | string | null;
  departureDate: Date | string;
  reason: string;
  lastWage: number;
  leaveAllowance?: number | null; // بدل الإجازات يدويًا — إن لم يُدخل يُحسب من الرصيد
  otherDues?: number | null;
  deductions?: number | null;
}

export interface SettlementDetail {
  slices: ReturnType<typeof indemnitySlices>;
  indemnityFull: number; // مجموع الشرائح بالأيام
  leaveAllowance: number; // بدل الإجازات النهائي (يدوي أو تعويض الرصيد تلقائيًا)
  otherDues: number;
  deductions: number;
  stbTotal: number; // راتب المكافأة = الأساسي + بدلات STB المخزنة
  stbHousing: number; stbSocial: number; stbProvident: number; stbInsurance: number;
  vacationDays: number;
  vacationAmount: number; // تعويض الإجازات = الأيام × (الراتب ÷ أيام العمل بالشهر)
  loanDeduction: number; // أقساط قروض غير مسددة
  daysPaid: number; // أيام مدفوعة حتى تاريخ الترك في شهر الترك
  worthSalary: number; // قيمتها
  servicePercent: number; // نسبة فترة الخدمة (٪) للاستقالة
  yearsServed: number;
  totalDays: number;
  totalDue: number;
}

/** تفاصيل كاملة للتسوية — تُخزن JSON داخل سجل DepartureSettlement */
export async function buildSettlementDetail(input: SettlementDetailInput): Promise<SettlementDetail> {
  const settings = await getSettings();
  const emp = await db.employee.findUnique({
    where: { id: input.employeeId },
    include: { contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 } },
  });

  const wage = Number(input.lastWage) || 0;
  const totalDays = input.hireDate ? daysBetween(input.hireDate, input.departureDate) : 0;
  const years = Math.round((totalDays / 365) * 100) / 100;

  // شرائح المكافأة بالأيام
  const slices = input.hireDate ? indemnitySlices(wage, input.hireDate, input.departureDate) : [];
  const indemnityFull = round3(slices.reduce((s, x) => s + x.amount, 0));

  // نسبة فترة الخدمة (استقالة) من جداول قابلة للضبط
  const tiers = parseResignTiers(settings.eosResignTiers);
  const servicePercent = servicePeriodPercent(input.reason, years, tiers);
  const eosAmount = round3(indemnityFull * (servicePercent / 100));

  // تفصيل راتب المكافأة من العقد النشط (سكن + بدلات) — مع فصل أي بدلات تُحسب في المكافأة
  const c = emp?.contracts[0];
  const stbHousing = round3(c?.housingAllowance || 0);
  const stbSocial = round3(c?.otherAllowance || 0);
  const stbProvident = 0; // صندوق ائتمان — يدوي من الواجهة إن وجد
  const stbInsurance = 0; // تأمين — يدوي من الواجهة إن وجد

  // تعويض الإجازات: أيام الرصيد المتبقي × قيمة اليوم
  const quota = settings.vacationAnnualQuota ?? 30;
  const bal = await vacationBalance(input.employeeId, input.hireDate, quota, input.departureDate);
  const vacationDays = Math.max(0, bal.balance);
  const dayRate = settings.workDaysPerMonth > 0 ? wage / settings.workDaysPerMonth : 0;
  const vacationAmount = round3(vacationDays * dayRate);

  // أقساط القروض غير المسددة
  const loans = await db.loan.findMany({ where: { employeeId: input.employeeId, status: 'active' } });
  const loanDeduction = round3(loans.reduce((s, l) => s + Math.max(0, (l.totalAmount - l.paidAmount)), 0));

  // أيام مدفوعة في شهر الترك حتى تاريخ الترك (قيمة راتب الفترة)
  const depKey = new Date(new Date(input.departureDate).getTime() - 0);
  const monthStart = new Date(Date.UTC(depKey.getUTCFullYear(), depKey.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(depKey.getUTCFullYear(), depKey.getUTCMonth() + 1, 0)).getUTCDate();
  let daysPaid = 0;
  if (input.hireDate) {
    const hireTime = new Date(input.hireDate).getTime();
    const monthStartTime = monthStart.getTime();
    const from = hireTime > monthStartTime ? new Date(input.hireDate) : monthStart;
    daysPaid = daysBetween(from, input.departureDate); // عدّ شامل (يوم الترك محسوب)
    if (daysPaid < 0) daysPaid = 0;
    if (daysPaid > daysInMonth) daysPaid = daysInMonth;
  }
  const worthSalary = round3((wage / daysInMonth) * daysPaid);

  // الإجازات: قيمة يدوية أو تعويض الرصيد تلقائيًا
  const leaveAllowance = input.leaveAllowance !== undefined && input.leaveAllowance !== null && String(input.leaveAllowance) !== ''
    ? Math.max(0, Number(input.leaveAllowance)) : vacationAmount;
  const other = Math.max(0, Number(input.otherDues) || 0);
  const deductions = Math.max(0, Number(input.deductions) || 0);

  const totalDue = round3(eosAmount + leaveAllowance + other - deductions);

  return {
    slices,
    indemnityFull,
    leaveAllowance,
    otherDues: other,
    deductions,
    stbTotal: wage,
    stbHousing, stbSocial, stbProvident, stbInsurance,
    vacationDays,
    vacationAmount: leaveAllowance,
    loanDeduction,
    daysPaid: round3(daysPaid),
    worthSalary,
    servicePercent,
    yearsServed: years,
    totalDays,
    totalDue,
  };
}
