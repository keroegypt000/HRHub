// lib/payroll.ts — محرك الرواتب الشفاف: يبني قسائم الشهر من الحضور اليومي المعتمد والعقود
// معادلات معلنة + تقريب 3 خانات في كل خطوة + مصدر لكل رقم (قواعد العمل 1، 13)
import { db } from '@/lib/db';
import { round3, hourRate, minuteRate, dayRate, otAmount } from '@/lib/calc';
import { getSettings } from '@/lib/settings';
import { dateKey, monthDayKeys, weekdayIndex, kuwaitMidnight } from '@/lib/time';

function parseWorkDays(json: string): number[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(Number) : [0, 1, 2, 3, 4];
  } catch {
    return [0, 1, 2, 3, 4];
  }
}

export interface ComputeResult {
  periodId: string;
  employees: number;
  totalNet: number;
}

function isCitizen(nationality?: string | null): boolean {
  if (!nationality) return false;
  const n = nationality.trim().toLowerCase();
  return n.includes('كويت') || n.includes('kuwait') || n === 'kwt';
}

/**
 * حساب فترة رواتب كاملة — يعمل فقط على فترة في حالة draft (قاعدة 13).
 * إعادة الحساب تحذف القسائم وتعيد بناءها.
 */
export async function computePayrollPeriod(periodId: string): Promise<ComputeResult> {
  const period = await db.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error('فترة الرواتب غير موجودة');
  if (period.status !== 'draft') {
    throw new Error('لا يمكن إعادة حساب فترة معتمدة أو مصروفة — أعد فتحها أولًا (للمدير فقط)');
  }

  const settings = await getSettings();
  const rates = {
    workDaysPerMonth: settings.workDaysPerMonth,
    hoursPerDay: settings.hoursPerDay,
    otWeekdayMult: settings.otWeekdayMult,
    otHolidayMult: settings.otHolidayMult,
    lateDeductionMode: settings.lateDeductionMode,
  };

  const components = await db.salaryComponent.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
  });

  // نطاق الفترة بأيام الكويت — لا نحسب أيامًا مستقبلية (الغياب لا يُخصم قبل وقوعه)
  const startKey = dateKey(period.startDate);
  const endKey = dateKey(period.endDate);
  const todayKey = dateKey();
  const allKeys = monthDayKeys(period.name);
  const keys = allKeys.filter((k) => k >= startKey && k <= endKey && k <= todayKey);
  if (keys.length === 0) {
    throw new Error('فترة مستقبلية بالكامل — لا يمكن حسابها قبل بدايتها');
  }

  const employees = await db.employee.findMany({
    where: { status: { not: 'terminated' } },
    include: {
      department: true,
      contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' } },
    },
  });

  // إجازات معتمدة داخل الفترة (لرصيد الإجازة غير المدفوعة)
  const leaveTypes = await db.leaveType.findMany();
  const unpaidTypeIds = new Set(leaveTypes.filter((t) => !t.paid).map((t) => t.id));
  const approvedLeaves = await db.leaveRequest.findMany({
    where: { status: 'approved', employeeId: { in: employees.map((e) => e.id) } },
  });

  // حذف القسائم القديمة وإعادة البناء
  await db.payslip.deleteMany({ where: { periodId } });

  let totalNet = 0;
  let count = 0;

  for (const emp of employees) {
    const contract = emp.contracts[0] || null;
    const basic = round3(contract?.basicSalary ?? emp.basicSalary ?? 0);
    const hoursPerDay = contract?.hoursPerDay || settings.hoursPerDay || 8;

    // الحضور اليومي للفترة
    const daily = await db.dailyAttendance.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: kuwaitMidnight(keys[0] || startKey), lte: kuwaitMidnight(keys[keys.length - 1] || endKey) },
      },
    });
    const dailyByKey = new Map(daily.map((d) => [dateKey(d.date), d]));

    // أيام العمل المتوقعة حسب وردية الموظف (افتراضي الإعدادات)
    const defaultShift = settings.defaultShiftId
      ? await db.shift.findUnique({ where: { id: settings.defaultShiftId } })
      : null;
    const workDaysArr = parseWorkDays(defaultShift?.workDays || '[0,1,2,3,4]');

    // حماية تاريخ التعيين: قبل التعيين لا يُحسب حضورًا ولا غيابًا (الغياب لا يُخصم قبل وقوعه)
    const hireKey = emp.hireDate ? dateKey(emp.hireDate) : null;

    let workedDays = 0;
    let absenceDays = 0;
    let lateMinutes = 0;
    let weekdayOtMinutes = 0;
    let holidayOtMinutes = 0;
    let missedPunchDays = 0;

    for (const key of keys) {
      if (hireKey && key < hireKey) continue; // يوم قبل تاريخ التعيين — مُتجاهل تمامًا
      const d = dailyByKey.get(key);
      const isWorkday = workDaysArr.includes(weekdayIndex(kuwaitMidnight(key)));
      if (d) {
        switch (d.status) {
          case 'present':
          case 'late':
            workedDays += 1;
            break;
          case 'half_day':
            workedDays += 0.5;
            absenceDays += 0.5;
            break;
          case 'absent':
            if (isWorkday) absenceDays += 1;
            break;
          case 'missed_punch':
            missedPunchDays += 1;
            break;
          case 'holiday':
          case 'weekend':
          case 'leave':
            // الإضافي في عطلة/راحة بمضاعف مختلف
            if (d.otMinutes > 0) holidayOtMinutes += d.otMinutes;
            break;
        }
        if (d.status === 'late') lateMinutes += d.lateMinutes;
        if ((d.status === 'present' || d.status === 'late') && d.otMinutes > 0) {
          weekdayOtMinutes += d.otMinutes;
        }
      } else if (isWorkday) {
        absenceDays += 1;
      }
    }

    // أيام الإجازة غير المدفوعة المعتمدة داخل الفترة
    let unpaidLeaveDays = 0;
    for (const lv of approvedLeaves) {
      if (!unpaidTypeIds.has(lv.leaveTypeId)) continue;
      const fromKey = dateKey(lv.fromDate);
      const toKey = dateKey(lv.toDate);
      for (const key of keys) {
        if (key >= fromKey && key <= toKey) unpaidLeaveDays += 1;
      }
    }

    // ===== المكملات =====
    const items: { componentId?: string; name: string; type: 'earning' | 'deduction'; amount: number; note?: string }[] = [];

    // الراتب الأساسي (من العقد أو ملف الموظف)
    items.push({ name: 'الراتب الأساسي', type: 'earning', amount: basic, note: contract ? `عقد ${contract.contractNo}` : 'من ملف الموظف' });

    // بدلات العقد (سكن/مواصلات/أخرى) كنسب أو قيم ثابتة من مكونات أو من العقد
    const contractAllowances: [string, number][] = [
      ['بدل سكن', round3(contract?.housingAllowance || 0)],
      ['بدل مواصلات', round3(contract?.transportAllowance || 0)],
      ['بدل أخرى', round3(contract?.otherAllowance || 0)],
    ];
    for (const [name, amount] of contractAllowances) {
      if (amount > 0) items.push({ name, type: 'earning', amount, note: 'من العقد' });
    }

    // مكونات إضافية من جدول المكونات
    for (const comp of components) {
      if (comp.calculation === 'attendance') continue; // الإضافي والخصومات تُحسب أدناه
      if (comp.type === 'earning' && comp.calculation === 'fixed') {
        // الأساسي يأتي من العقد/الملف دائمًا؛ بدلات النظام الثابتة تُستثنى فقط إذا العقد وفرها
        if (comp.code === 'BASIC') continue;
        if (comp.code === 'HOUSING' && (contract?.housingAllowance || 0) > 0) continue;
        if (comp.code === 'TRANSPORT' && (contract?.transportAllowance || 0) > 0) continue;
        if (comp.code === 'OTHER' && (contract?.otherAllowance || 0) > 0) continue;
        if (comp.value <= 0) continue;
        items.push({ componentId: comp.id, name: comp.name, type: 'earning', amount: round3(comp.value) });
      } else if (comp.type === 'earning' && comp.calculation === 'percent') {
        if (comp.code === 'BASIC') continue;
        if (comp.code === 'HOUSING' && (contract?.housingAllowance || 0) > 0) continue;
        if (comp.code === 'TRANSPORT' && (contract?.transportAllowance || 0) > 0) continue;
        if (comp.code === 'OTHER' && (contract?.otherAllowance || 0) > 0) continue;
        if (!(comp.percentOfBasic)) continue;
        items.push({
          componentId: comp.id, name: comp.name, type: 'earning',
          amount: round3(((comp.percentOfBasic || 0) / 100) * basic),
          note: `${comp.percentOfBasic}% من الأساسي`,
        });
      }
    }

    // العمل الإضافي
    const hr = hourRate(basic, rates);
    const otVal = otAmount(basic, weekdayOtMinutes, holidayOtMinutes, rates);
    const otComp = components.find((c) => c.code === 'OT' && c.type === 'earning');
    if (otVal > 0) {
      items.push({
        componentId: otComp?.id,
        name: 'بدل العمل الإضافي',
        type: 'earning',
        amount: otVal,
        note: `${(weekdayOtMinutes / 60).toFixed(1)} ساعة ×${rates.otWeekdayMult} + ${(holidayOtMinutes / 60).toFixed(1)} ساعة ×${rates.otHolidayMult} (أجر الساعة ${hr.toFixed(3)})`,
      });
    }

    // ===== الاستقطاعات =====
    const mr = minuteRate(basic, rates);
    const dr = dayRate(basic, rates);

    // خصم التأخير
    const lateComp = components.find((c) => c.code === 'LATE' && c.type === 'deduction');
    const lateDeduction = rates.lateDeductionMode === 'minute' ? round3(mr * lateMinutes) : 0;
    if (lateDeduction > 0) {
      items.push({
        componentId: lateComp?.id, name: 'خصم التأخير', type: 'deduction', amount: lateDeduction,
        note: `${lateMinutes} دقيقة × ${mr.toFixed(3)} أجر الدقيقة`,
      });
    }

    // خصم الغياب
    const absComp = components.find((c) => c.code === 'ABSENCE' && c.type === 'deduction');
    const absenceDeduction = round3(dr * absenceDays);
    if (absenceDeduction > 0) {
      items.push({
        componentId: absComp?.id, name: 'خصم الغياب', type: 'deduction', amount: absenceDeduction,
        note: `${absenceDays} يوم × ${dr.toFixed(3)} أجر اليوم`,
      });
    }

    // خصم الإجازة غير المدفوعة
    const ulComp = components.find((c) => c.code === 'UNPAID' && c.type === 'deduction');
    const unpaidDeduction = round3(dr * unpaidLeaveDays);
    if (unpaidDeduction > 0) {
      items.push({
        componentId: ulComp?.id, name: 'خصم إجازة غير مدفوعة', type: 'deduction', amount: unpaidDeduction,
        note: `${unpaidLeaveDays} يوم × ${dr.toFixed(3)}`,
      });
    }

    // التأمينات الاجتماعية (نصيب الموظف يُخصم من الصافي)
    const citizen = isCitizen(emp.nationality);
    if (settings.socialSecurityEnabled) {
      const sscComp = components.find((c) => c.code === 'SSC' && c.type === 'deduction');
      const employeeShare = citizen
        ? round3(((settings.sscEmployeeCitizen || 0) / 100) * basic)
        : 0;
      if (employeeShare > 0) {
        items.push({
          componentId: sscComp?.id, name: 'التأمينات الاجتماعية (نصيب الموظف)', type: 'deduction',
          amount: employeeShare, note: `${settings.sscEmployeeCitizen}% مواطن — جهة العمل ${settings.sscEmployerCitizen}%`,
        });
      }
      if (!citizen && settings.sscEmployerExpatriate > 0) {
        // نصيب جهة العمل للمقيم لا يُخصم من الموظف — يُثبت للتوثيق فقط
        items.push({
          name: 'تأمينات جهة العمل (مقيم — على الجهة)', type: 'earning', amount: 0,
          note: `${settings.sscEmployerExpatriate}% على جهة العمل لا يخصم من الموظف`,
        });
      }
    }

    // سلف أو استقطاعات أخرى يدوية
    for (const comp of components) {
      if (comp.type === 'deduction' && comp.calculation === 'fixed' && comp.value > 0) {
        if (['LATE', 'ABSENCE', 'UNPAID', 'SSC'].includes(comp.code)) continue;
        items.push({ componentId: comp.id, name: comp.name, type: 'deduction', amount: round3(comp.value) });
      }
    }

    // الإجماليات بتقريب موحد
    const totalEarnings = round3(items.filter((i) => i.type === 'earning').reduce((s, i) => s + i.amount, 0));
    const totalDeductions = round3(items.filter((i) => i.type === 'deduction').reduce((s, i) => s + i.amount, 0));
    const netPay = round3(totalEarnings - totalDeductions);
    totalNet = round3(totalNet + netPay);

    const notes: string[] = [];
    if (missedPunchDays > 0) notes.push(`${missedPunchDays} يوم بصمة ناقصة (missed_punch) بلا خصم — راجعه`);

    const payslip = await db.payslip.create({
      data: {
        periodId,
        employeeId: emp.id,
        basicSalary: basic,
        totalEarnings,
        totalDeductions,
        netPay,
        workedDays,
        absenceDays,
        otHours: round3((weekdayOtMinutes + holidayOtMinutes) / 60),
        otAmount: otVal,
        lateMinutes,
        lateDeduction,
        absenceDeduction,
        status: 'draft',
        notes: notes.join(' — ') || null,
      },
    });

    for (const item of items) {
      await db.payslipItem.create({
        data: {
          payslipId: payslip.id,
          componentId: item.componentId || null,
          name: item.name,
          type: item.type,
          amount: item.amount,
          note: item.note || null,
        },
      });
    }
    count++;
  }

  await db.payrollPeriod.update({
    where: { id: periodId },
    data: { status: 'computed', computedAt: new Date() },
  });

  return { periodId, employees: count, totalNet };
}
