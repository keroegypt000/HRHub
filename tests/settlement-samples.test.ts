// اختبارات مطابقة الحسابات لعينات MenaITech الفعلية (Al Fares Garden)
import { describe, expect, it } from 'vitest';
import {
  indemnitySlices, slicesExactTotal, servicePeriodPercent, finalMonthSalary, settlementTotal, capIndemnity,
  eosWage, workingDaysBetween,
} from '@/lib/indemnity';
import { vacationAdvanceBreakdown } from '@/lib/vacation';
import { effectiveWorkDays } from '@/lib/workweek';
import { round3 } from '@/lib/calc';

const SUNDAY_OFF = effectiveWorkDays('[0]', null); // راحة الأحد — الاثنين..السبت عمل

describe('Final settlement — FG0033 Swapan (استقالة)', () => {
  const hire = '2023-01-12T00:00:00+03:00';
  const term = '2026-09-27T00:00:00+03:00';
  const wage = 195;

  it('شرائح المكافأة: 1095 + 260 يوم = 417.635', () => {
    const slices = indemnitySlices(wage, hire, term);
    expect(slices.map((s) => s.workingDays)).toEqual([1095, 260]);
    expect(slices.map((s) => s.amount)).toEqual([337.498, 80.137]);
    expect(round3(slicesExactTotal(slices))).toBe(417.635);
  });

  it('استقالة بعد 3.71 سنة = 50% (المادة 51) = 208.817', () => {
    const pct = servicePeriodPercent('resigned', 1355 / 365);
    expect(pct).toBe(50);
    const exact = slicesExactTotal(indemnitySlices(wage, hire, term));
    expect(round3(exact * pct / 100)).toBe(208.817);
  });

  it('راتب شهر الترك: 23 يوم عمل × 195 ÷ 26 = 172.500', () => {
    expect(finalMonthSalary(wage, hire, term, SUNDAY_OFF, 26)).toEqual({ daysPaid: 23, worthSalary: 172.5 });
  });

  it('تعويض الإجازات 40.412 يوم × 7.5 = 303.090 والإجمالي 684.407', () => {
    const leave = round3(40.412 * (wage / 26));
    expect(leave).toBe(303.09);
    const total = settlementTotal({
      worthSalary: 172.5, eosAmount: 208.817, leaveAllowance: leave, otherDues: 0, deductions: 0, loanDeduction: 0,
    });
    expect(total).toBe(684.407);
  });

  it('القروض غير المسددة تُخصم من الإجمالي', () => {
    expect(settlementTotal({ worthSalary: 100, eosAmount: 50, leaveAllowance: 0, otherDues: 0, deductions: 0, loanDeduction: 30 })).toBe(120);
  });
});

describe('قواعد عامة لنهاية الخدمة', () => {
  it('نسب الاستقالة الكويتية', () => {
    expect(servicePeriodPercent('resigned', 2.9)).toBe(0);
    expect(servicePeriodPercent('resigned', 4)).toBe(50);
    expect(servicePeriodPercent('resigned', 7)).toBe(66.667);
    expect(servicePeriodPercent('resigned', 12)).toBe(100);
    expect(servicePeriodPercent('terminated', 1)).toBe(100);
  });

  it('الحد الأقصى أجر 18 شهرًا', () => {
    expect(capIndemnity(5000, 200)).toBe(3600);
    expect(capIndemnity(1000, 200)).toBe(1000);
  });

  it('أساس المكافأة: الأساسي فقط أو مع البدلات', () => {
    const parts = { basic: 300, housing: 60, transport: 25, other: 15 };
    expect(eosWage(parts, 'basic')).toBe(300);
    expect(eosWage(parts, 'full_wage')).toBe(400);
  });

  it('يوم الراحة يختلف لكل موظف', () => {
    expect(effectiveWorkDays('[5]', '[0,1,2,3,4]')).toEqual([0, 1, 2, 3, 4, 6]); // راحة الجمعة تتقدم على الوردية
    expect(effectiveWorkDays(null, '[0,1,2,3,4]')).toEqual([0, 1, 2, 3, 4]); // بلا اختيار → الوردية
    expect(workingDaysBetween('2026-09-01T00:00:00+03:00', '2026-09-30T00:00:00+03:00', effectiveWorkDays('[5,6]', null))).toBe(22);
  });
});

describe('Vacation In-Advance — FG0050 Reeyanth', () => {
  const r = vacationAdvanceBreakdown(
    '2026-06-06T00:00:00+03:00', '2026-08-08T00:00:00+03:00', 115, 26, SUNDAY_OFF, '2024-04-21T00:00:00+03:00',
  );

  it('مدة الإجازة 55 يوم', () => {
    expect(r.periodDays).toBe(55);
  });

  it('أيام العمل قبل الإجازة: يونيو 5 أيام = 22.115', () => {
    expect(r.workingDaysTotal).toBe(5);
    expect(r.workingAmountTotal).toBe(22.115);
  });

  it('أيام الإجازة شهريًا 21 / 26 (سقف) / 7 = 238.847', () => {
    expect(r.rows.map((x) => [x.month, x.vacationDays, x.vacationAmount])).toEqual([
      ['2026-06', 21, 92.885],
      ['2026-07', 26, 115],
      ['2026-08', 7, 30.962],
    ]);
    expect(r.vacationAmountTotal).toBe(238.847);
  });

  it('إجمالي المقدّم 260.962', () => {
    expect(r.advanceTotal).toBe(260.962);
  });
});
