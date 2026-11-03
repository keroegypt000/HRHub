// قواعد الراتب حسب الحضور — كل حالة شكا منها المستخدم أو قد تحدث
import { describe, expect, it } from 'vitest';
import { attendancePay, lateDeductionAmount, otAmount, unpaidHolidayIndexes } from '@/lib/calc';

const base = { monthlyFixed: 260, monthWorkDays: 27, employedWorkDays: 27, absentDays: 0, unpaidLeaveDays: 0 };

describe('attendancePay', () => {
  it('حضر الشهر كله → الراتب كامل', () => {
    expect(attendancePay(base).payable).toBe(260);
  });

  it('غاب الشهر كله → صفر (كان يأخذ البدلات كاملة)', () => {
    const r = attendancePay({ ...base, monthlyFixed: 368, absentDays: 27 }); // أساسي 260 + سكن 78 + مواصلات 30
    expect(r.payable).toBe(0);
    expect(r.absenceDeduction).toBe(368);
  });

  it('معيَّن يوم 25 ولم يحضر → صفر (كان يأخذ 308)', () => {
    expect(attendancePay({ ...base, monthlyFixed: 368, employedWorkDays: 6, absentDays: 6 }).payable).toBe(0);
  });

  it('معيَّن يوم 25 وحضر أيامه الستة → نصيب 6 أيام فقط', () => {
    const r = attendancePay({ ...base, employedWorkDays: 6 });
    expect(r.notEmployedDays).toBe(21);
    expect(r.payable).toBe(57.778); // 260 × 6 ÷ 27
  });

  it('غياب يوم واحد في شهر 26 يوم عمل = خصم ÷26 (مثل MenaITech: 195 ÷ 26 = 7.5)', () => {
    const r = attendancePay({ monthlyFixed: 195, monthWorkDays: 26, employedWorkDays: 26, absentDays: 1, unpaidLeaveDays: 0 });
    expect(r.absenceDeduction).toBe(7.5);
    expect(r.payable).toBe(187.5);
  });

  it('موظف 5 أيام (راحة الجمعة والسبت) غاب كل أيامه → صفر', () => {
    expect(attendancePay({ monthlyFixed: 1000, monthWorkDays: 22, employedWorkDays: 22, absentDays: 22, unpaidLeaveDays: 0 }).payable).toBe(0);
  });

  it('الخصومات لا تتجاوز الراتب أبدًا', () => {
    const r = attendancePay({ ...base, employedWorkDays: 10, absentDays: 10, unpaidLeaveDays: 5 });
    expect(r.notEmployedDeduction + r.absenceDeduction + r.unpaidDeduction).toBeCloseTo(260, 3);
    expect(r.payable).toBe(0);
  });

  it('إجازة بدون راتب 3 أيام', () => {
    const r = attendancePay({ ...base, monthWorkDays: 26, employedWorkDays: 26, unpaidLeaveDays: 3 });
    expect(r.unpaidDeduction).toBe(30);
    expect(r.payable).toBe(230);
  });
});

describe('late and overtime rates (no intermediate rounding)', () => {
  it('تأخير 54 دقيقة على أساسي 380', () => {
    // 380 ÷ 26 ÷ 8 ÷ 60 × 54 = 1.644 (كان 1.620 بسبب تقريب أجر الدقيقة إلى 0.030)
    expect(lateDeductionAmount(380, 54)).toBe(1.644);
  });

  it('إضافي 13 ساعة عادية على أساسي 380', () => {
    // 380 ÷ 26 ÷ 8 × 13 × 1.25 = 29.688
    expect(otAmount(380, 13 * 60, 0)).toBe(29.688);
  });
});

describe('unpaidHolidayIndexes (holiday between absences)', () => {
  const day = (s: string, wd = true) => ({ s, wd });
  it('غياب الشهر كله + عطلة → العطلة غير مدفوعة (حالة Maria: 9.231 → 0)', () => {
    const days = [day('a'), day('a'), day('ho'), day('a'), day('we', false), day('a')];
    expect(unpaidHolidayIndexes(days)).toEqual([2]);
    const r = attendancePay({ monthlyFixed: 240, monthWorkDays: 26, employedWorkDays: 26, absentDays: 26, unpaidLeaveDays: 0 });
    expect(r.payable).toBe(0);
  });
  it('حاضر قبل العطلة → مدفوعة', () => {
    expect(unpaidHolidayIndexes([day('p'), day('ho'), day('a')])).toEqual([]);
  });
  it('حاضر بعد العطلة → مدفوعة', () => {
    expect(unpaidHolidayIndexes([day('a'), day('ho'), day('p')])).toEqual([]);
  });
  it('الراحة الأسبوعية بين العطلة والغياب لا تكسر القاعدة', () => {
    expect(unpaidHolidayIndexes([day('a'), day('we', false), day('ho'), day('ho'), day('we', false), day('a')])).toEqual([2, 3]);
  });
  it('عطلة على يوم راحة لا تُحتسب', () => {
    expect(unpaidHolidayIndexes([day('a'), day('ho', false), day('a')])).toEqual([]);
  });
  it('إجازة بدون راتب قبل وبعد → غير مدفوعة', () => {
    expect(unpaidHolidayIndexes([day('lu'), day('ho'), day('lu')])).toEqual([1]);
  });
});
