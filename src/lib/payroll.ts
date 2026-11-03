// lib/payroll.ts — محرك الرواتب الشفاف: يبني قسائم الشهر من الحضور والعقود والإجازات والعطلات
// معادلات معلنة + تقريب 3 خانات في كل خطوة + مصدر لكل رقم
// ترتيب حسم حالة اليوم: عطلة رسمية ← راحة أسبوعية (وردية الموظف) ← إجازة معتمدة ← بصمة اليوم ← غياب
import { db } from '@/lib/db';
import { round3, hourRate, otAmount, lateDeductionAmount, attendancePay } from '@/lib/calc';
import { getSettings } from '@/lib/settings';
import { dateKey, monthDayKeys, weekdayIndex, kuwaitMidnight } from '@/lib/time';
import { effectiveWorkDays } from '@/lib/workweek';

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

/** إعادة حساب إجماليات قسيمة من بنودها — بعد أي تعديل يدوي */
export async function recalcPayslipTotals(payslipId: string): Promise<void> {
  const items = await db.payslipItem.findMany({ where: { payslipId } });
  const totalEarnings = round3(items.filter((i) => i.type === 'earning').reduce((s, i) => s + i.amount, 0));
  const totalDeductions = round3(items.filter((i) => i.type === 'deduction').reduce((s, i) => s + i.amount, 0));
  const netPay = round3(totalEarnings - totalDeductions);
  await db.payslip.update({ where: { id: payslipId }, data: { totalEarnings, totalDeductions, netPay } });
}

interface ManualItemSnapshot {
  componentId: string | null;
  name: string;
  type: string;
  amount: number;
  note: string | null;
  editedBy: string | null;
  editedAt: Date | null;
}

/**
 * حساب فترة رواتب كاملة — يعمل على فترة draft أو computed (قبل الاعتماد).
 * الفترات المعتمدة/المصروفة تتطلب «إعادة فتح» (مدير) ثم إعادة حساب.
 * البنود اليدوية المضافة من المحاسب تُحفظ وتُعاد بناؤها كما هي.
 */
export async function computePayrollPeriod(periodId: string): Promise<ComputeResult> {
  const period = await db.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error('فترة الرواتب غير موجودة');
  if (period.status === 'approved' || period.status === 'paid') {
    throw new Error('الفترة معتمدة أو مصروفة — أعد فتحها أولًا (للمدير فقط) ثم أعد الحساب');
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
  // لا تُحسب رواتب فترة لم تنتهِ — الأيام القادمة لم تحدث بعد فيأخذ الجميع رواتب كاملة بالخطأ
  if (endKey > todayKey) {
    throw new Error(`الفترة لم تنتهِ بعد — تُحسب رواتب ${period.name} بعد آخر يوم فيها (${endKey})`);
  }
  // الأيام قبل تاريخ بدء احتساب الحضور لا تُحسب غيابًا (قبل تشغيل البصمة)
  const attendanceStartKey = settings.attendanceStartDate || '';
  const allKeys = monthDayKeys(period.name);
  const periodKeys = allKeys.filter((k) => k >= startKey && k <= endKey);
  const keys = allKeys.filter((k) => k >= startKey && k <= endKey && k <= todayKey);
  if (keys.length === 0) {
    throw new Error('فترة مستقبلية بالكامل — لا يمكن حسابها قبل بدايتها');
  }
  const rangeStart = kuwaitMidnight(keys[0]);
  const rangeEnd = kuwaitMidnight(keys[keys.length - 1]);

  const employees = await db.employee.findMany({
    where: { status: { in: ['active', 'suspended', 'on_leave'] } },
    include: {
      contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' } },
    },
  });
  const empIds = employees.map((e) => e.id);

  // إسنادات الورديات خلال الفترة (وردية كل موظف تحدد أيام الراحة الأسبوعية)
  const assignments = await db.shiftAssignment.findMany({
    where: { employeeId: { in: empIds }, fromDate: { lte: rangeEnd } },
  });
  const activeAssignments = assignments.filter(
    (a) => !a.toDate || dateKey(a.toDate) >= startKey
  );
  const shiftIds = [...new Set(activeAssignments.map((a) => a.shiftId))];
  const shifts = shiftIds.length ? await db.shift.findMany({ where: { id: { in: shiftIds } } }) : [];
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  // العطلات الرسمية (شاملة النطاقات والمتكررة سنويًا)
  const holidays = await db.holiday.findMany();
  const holidayForKey = (key: string): boolean => {
    const md = key.slice(5); // MM-DD
    for (const h of holidays) {
      const from = dateKey(h.date);
      const to = h.endDate ? dateKey(h.endDate) : from;
      if (key >= from && key <= to) return true;
      if (h.recurring) {
        const fromMd = from.slice(5);
        const toMd = to.slice(5);
        if (fromMd <= toMd ? md >= fromMd && md <= toMd : md >= fromMd || md <= toMd) return true;
      }
    }
    return false;
  };

  // الإجازات المعتمدة — تحمي اليوم من الغياب (مدفوعة) أو تُخصم (غير مدفوعة)
  const leaveTypes = await db.leaveType.findMany();
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]));
  const approvedLeaves = await db.leaveRequest.findMany({
    where: { status: 'approved', employeeId: { in: empIds } },
  });
  const leavesByEmp = new Map<string, typeof approvedLeaves>();
  for (const lv of approvedLeaves) {
    let arr = leavesByEmp.get(lv.employeeId);
    if (!arr) leavesByEmp.set(lv.employeeId, (arr = []));
    arr.push(lv);
  }

  // الحضور اليومي المعالج
  const daily = await db.dailyAttendance.findMany({
    where: { employeeId: { in: empIds }, date: { gte: rangeStart, lte: rangeEnd } },
  });
  const dailyByEmp = new Map<string, Map<string, (typeof daily)[number]>>();
  for (const d of daily) {
    let m = dailyByEmp.get(d.employeeId);
    if (!m) dailyByEmp.set(d.employeeId, (m = new Map()));
    m.set(dateKey(d.date), d);
  }

  // البنود اليدوية السابقة — تُحفظ قبل الحذف وتُعاد بعد البناء (تعديلات المحاسب لا تضيع)
  const previousManual = await db.payslipItem.findMany({
    where: { source: 'manual', payslip: { periodId } },
    include: { payslip: { select: { employeeId: true } } },
  });
  const manualByEmp = new Map<string, ManualItemSnapshot[]>();
  for (const it of previousManual) {
    let arr = manualByEmp.get(it.payslip.employeeId);
    if (!arr) manualByEmp.set(it.payslip.employeeId, (arr = []));
    arr.push({
      componentId: it.componentId, name: it.name, type: it.type,
      amount: it.amount, note: it.note, editedBy: it.editedBy, editedAt: it.editedAt,
    });
  }
  /** أسماء البنود اليدوية لكل موظف — البند المحسوب الذي له نسخة يدوية معدّلة يُتخطى (اليدوي يحل محله) */
  const manualNamesByEmp = new Map<string, Set<string>>();
  for (const [eid, arr] of manualByEmp) {
    manualNamesByEmp.set(eid, new Set(arr.map((m) => m.name.trim())));
  }

  // حذف القسائم القديمة وإعادة البناء
  await db.payslip.deleteMany({ where: { periodId } });

  const defaultShift = settings.defaultShiftId
    ? await db.shift.findUnique({ where: { id: settings.defaultShiftId } })
    : null;

  /** أيام عمل الموظف في يوم معين: أيام راحته الخاصة ← ورديته الفعلية ← الوردية الافتراضية */
  const workDaysFor = (emp: { id: string; weeklyOffDays: string | null }, key: string): number[] => {
    let found: (typeof activeAssignments)[number] | null = null;
    for (const a of activeAssignments) {
      if (a.employeeId !== emp.id) continue;
      if (dateKey(a.fromDate) <= key && (!a.toDate || dateKey(a.toDate) >= key)) {
        if (!found || a.fromDate > found.fromDate) found = a;
      }
    }
    const shift = found ? shiftById.get(found.shiftId) : defaultShift;
    return effectiveWorkDays(emp.weeklyOffDays, shift?.workDays);
  };

  let totalNet = 0;
  let count = 0;

  for (const emp of employees) {
    const contract = emp.contracts[0] || null;
    const basic = round3(contract?.basicSalary ?? emp.basicSalary ?? 0);

    // حماية تاريخ التعيين وتاريخ ترك العمل: خارج النطاق لا يُحسب حضورًا ولا غيابًا
    const hireKey = emp.hireDate ? dateKey(emp.hireDate) : null;
    const departKey = emp.departureDate ? dateKey(emp.departureDate) : null;

    const empLeaves = leavesByEmp.get(emp.id) || [];
    const empDaily = dailyByEmp.get(emp.id) || new Map();

    let workedDays = 0;
    let absenceDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let holidayDays = 0;
    let weekOffDays = 0;
    let missedPunchDays = 0;
    let lateMinutes = 0;
    let weekdayOtMinutes = 0;
    let holidayOtMinutes = 0;
    const ledger: { d: string; s: string }[] = [];

    for (const key of keys) {
      if (hireKey && key < hireKey) continue; // يوم قبل التعيين — مُتجاهل تمامًا
      if (departKey && key > departKey) continue; // يوم بعد ترك العمل/الوفاة — مُتجاهل تمامًا

      const row = empDaily.get(key);
      const isWorkday = workDaysFor(emp, key).includes(weekdayIndex(kuwaitMidnight(key)));
      let code = 'a';

      if (holidayForKey(key)) {
        // 1) عطلة رسمية — مدفوعة بلا خصم
        code = 'ho';
        holidayDays += 1;
        if (row && row.otMinutes > 0) holidayOtMinutes += row.otMinutes;
      } else if (!isWorkday) {
        // 2) راحة أسبوعية حسب وردية الموظف — مدفوعة بلا خصم
        code = 'we';
        weekOffDays += 1;
        if (row && row.otMinutes > 0) holidayOtMinutes += row.otMinutes;
      } else {
        // 3) إجازة معتمدة تغطي اليوم
        const lv = empLeaves.find((l) => dateKey(l.fromDate) <= key && key <= dateKey(l.toDate));
        if (lv) {
          const t = typeById.get(lv.leaveTypeId);
          const paid = t ? t.paid : true;
          if (paid) { code = 'lp'; paidLeaveDays += 1; }
          else { code = 'lu'; unpaidLeaveDays += 1; }
          if (row && row.otMinutes > 0) holidayOtMinutes += row.otMinutes;
        } else if (emp.attendanceExempt || (attendanceStartKey && key < attendanceStartKey)) {
          // 4) معفى من البصمة، أو يوم قبل بدء احتساب الحضور — يوم مدفوع بلا غياب ولا تأخير
          code = 'x';
          workedDays += 1;
          if (row && row.otMinutes > 0 && (row.status === 'present' || row.status === 'late')) weekdayOtMinutes += row.otMinutes;
        } else if (row) {
          // 5) حالة يوم الحضور اليومي
          switch (row.status) {
            case 'present': code = 'p'; workedDays += 1; break;
            case 'late': code = 'l'; workedDays += 1; lateMinutes += row.lateMinutes; break;
            case 'half_day': code = 'h'; workedDays += 0.5; absenceDays += 0.5; break;
            case 'absent': code = 'a'; absenceDays += 1; break;
            case 'leave': code = 'lp'; paidLeaveDays += 1; break; // معلم إجازة في الحضور
            case 'holiday': code = 'ho'; holidayDays += 1; break;
            case 'weekend': code = 'we'; weekOffDays += 1; break;
            default: code = 'm'; missedPunchDays += 1; break; // missed_punch بلا خصم
          }
          if ((row.status === 'present' || row.status === 'late') && row.otMinutes > 0) {
            weekdayOtMinutes += row.otMinutes;
          }
        } else {
          // 6) يوم عمل بلا بصمة ولا إجازة → غياب
          code = 'a';
          absenceDays += 1;
        }
      }
      ledger.push({ d: key.slice(8), s: code });
    }

    // ===== المكملات =====
    const items: {
      componentId?: string | null; name: string; type: 'earning' | 'deduction';
      amount: number; note?: string; source?: 'manual'; editedBy?: string | null; editedAt?: Date | null; loanId?: string | null;
    }[] = [];

    // أي بند محسوب له نسخة يدوية معدلة (نفس الاسم) يُتخطى — النسخة اليدوية تحل محله
    const manualNames = manualNamesByEmp.get(emp.id) || new Set<string>();
    const pushAuto = (item: { name: string; type: 'earning' | 'deduction'; amount: number; note?: string; componentId?: string | null; loanId?: string | null }) => {
      if (manualNames.has(item.name.trim())) return;
      items.push(item);
    };

    // الراتب الأساسي (من العقد أو ملف الموظف)
    pushAuto({ name: 'الراتب الأساسي', type: 'earning', amount: basic, note: contract ? `عقد ${contract.contractNo}` : 'من ملف الموظف' });

    // بدلات العقد (سكن/مواصلات/أخرى)
    const contractAllowances: [string, number][] = [
      ['بدل سكن', round3(contract?.housingAllowance || 0)],
      ['بدل مواصلات', round3(contract?.transportAllowance || 0)],
      ['بدل أخرى', round3(contract?.otherAllowance || 0)],
    ];
    for (const [name, amount] of contractAllowances) {
      if (amount > 0) pushAuto({ name, type: 'earning', amount, note: 'من العقد' });
    }

    // البدلات تأتي من عقد الموظف فقط — لم تعد مكونات الراتب (سكن 30% / مواصلات) تُضاف للجميع تلقائيًا

    // الراتب الشهري الثابت (الأساسي + البدلات) — أساس خصم الغياب وأيام ما قبل التعيين
    const monthlyFixed = round3(items.filter((i) => i.type === 'earning').reduce((s, i) => s + i.amount, 0));

    // أيام عمل الموظف في الشهر كله، ومنها داخل فترة عمله (التعيين ← ترك العمل)
    let monthWorkDays = 0;
    let employedWorkDays = 0;
    for (const key of periodKeys) {
      if (!workDaysFor(emp, key).includes(weekdayIndex(kuwaitMidnight(key)))) continue;
      monthWorkDays++;
      if (hireKey && key < hireKey) continue;
      if (departKey && key > departKey) continue;
      employedWorkDays++;
    }
    const pay = attendancePay({ monthlyFixed, monthWorkDays, employedWorkDays, absentDays: absenceDays, unpaidLeaveDays });

    // العمل الإضافي
    const hr = hourRate(basic, rates);
    // الإضافي يُصرف فقط لمن فُعّل له «يستحق العمل الإضافي» — وإلا يظهر في الملاحظات للمراجعة
    const computedOt = otAmount(basic, weekdayOtMinutes, holidayOtMinutes, rates);
    const otVal = emp.otEligible ? computedOt : 0;
    const otComp = components.find((c) => c.code === 'OT' && c.type === 'earning');
    if (otVal > 0) {
      pushAuto({
        componentId: otComp?.id,
        name: 'بدل العمل الإضافي',
        type: 'earning',
        amount: otVal,
        note: `${(weekdayOtMinutes / 60).toFixed(1)} ساعة ×${rates.otWeekdayMult} + ${(holidayOtMinutes / 60).toFixed(1)} ساعة ×${rates.otHolidayMult} (أجر الساعة ${hr.toFixed(3)})`,
      });
    }

    // ===== الاستقطاعات =====
    // أيام قبل التعيين / بعد ترك العمل (المعيَّن في منتصف الشهر يأخذ نصيب أيامه فقط)
    if (pay.notEmployedDeduction > 0) {
      pushAuto({
        name: 'أيام خارج فترة العمل', type: 'deduction', amount: pay.notEmployedDeduction,
        note: `${pay.notEmployedDays} من ${monthWorkDays} يوم عمل بالشهر — ${hireKey && hireKey > startKey ? `التعيين ${hireKey}` : ''}${departKey && departKey < endKey ? ` ترك العمل ${departKey}` : ''}`.trim(),
      });
    }

    // خصم الغياب — على الراتب الثابت كله (الأساسي + البدلات) بنسبة الأيام
    const absComp = components.find((c) => c.code === 'ABSENCE' && c.type === 'deduction');
    const absenceDeduction = pay.absenceDeduction;
    if (absenceDeduction > 0) {
      pushAuto({
        componentId: absComp?.id, name: 'خصم الغياب', type: 'deduction', amount: absenceDeduction,
        note: `${absenceDays} يوم × ${pay.dayValue.toFixed(3)} قيمة اليوم (${monthlyFixed.toFixed(3)} ÷ ${monthWorkDays} يوم عمل)`,
      });
    }

    // خصم الإجازة غير المدفوعة المعتمدة
    const ulComp = components.find((c) => c.code === 'UNPAID' && c.type === 'deduction');
    if (pay.unpaidDeduction > 0) {
      pushAuto({
        componentId: ulComp?.id, name: 'خصم إجازة غير مدفوعة', type: 'deduction', amount: pay.unpaidDeduction,
        note: `${unpaidLeaveDays} يوم × ${pay.dayValue.toFixed(3)}`,
      });
    }

    // خصم التأخير — لا يُخصم تأخير من موظف لم يتبق له راتب
    const lateComp = components.find((c) => c.code === 'LATE' && c.type === 'deduction');
    const lateDeduction = Math.min(pay.payable, lateDeductionAmount(basic, lateMinutes, rates));
    if (lateDeduction > 0) {
      pushAuto({
        componentId: lateComp?.id, name: 'خصم التأخير', type: 'deduction', amount: lateDeduction,
        note: `${lateMinutes} دقيقة × أجر الدقيقة (الأساسي ÷ ${rates.workDaysPerMonth} ÷ ${rates.hoursPerDay} ÷ 60)`,
      });
    }

    // التأمينات الاجتماعية (نصيب الموظف)
    const citizen = isCitizen(emp.nationality);
    if (settings.socialSecurityEnabled) {
      const sscComp = components.find((c) => c.code === 'SSC' && c.type === 'deduction');
      const employeeShare = citizen ? round3(((settings.sscEmployeeCitizen || 0) / 100) * basic) : 0;
      if (employeeShare > 0) {
        pushAuto({
          componentId: sscComp?.id, name: 'التأمينات الاجتماعية (نصيب الموظف)', type: 'deduction',
          amount: employeeShare, note: `${settings.sscEmployeeCitizen}% مواطن — جهة العمل ${settings.sscEmployerCitizen}%`,
        });
      }
      if (!citizen && settings.sscEmployerExpatriate > 0) {
        pushAuto({
          name: 'تأمينات جهة العمل (مقيم — على الجهة)', type: 'earning', amount: 0,
          note: `${settings.sscEmployerExpatriate}% على جهة العمل لا يخصم من الموظف`,
        });
      }
    }

    // سلف أو استقطاعات أخرى ثابتة من جدول المكونات
    for (const comp of components) {
      if (comp.type === 'deduction' && comp.calculation === 'fixed' && comp.value > 0) {
        if (['LATE', 'ABSENCE', 'UNPAID', 'SSC'].includes(comp.code)) continue;
        pushAuto({ componentId: comp.id, name: comp.name, type: 'deduction', amount: round3(comp.value) });
      }
    }

    // أقساط السلف والقروض النشطة — تُخصم تلقائيًا في الشهور التي تبدأ فيها أو بعدها
    const empLoans = await db.loan.findMany({ where: { employeeId: emp.id, status: 'active' } });
    for (const loan of empLoans) {
      if (dateKey(loan.startDate) > endKey) continue; // لم يبدأ الخصم بعد
      const remaining = round3(loan.totalAmount - loan.paidAmount);
      if (remaining <= 0) continue;
      const amount = round3(Math.min(loan.monthlyDeduction, remaining));
      pushAuto({
        name: `قسط سلفة: ${loan.name}`,
        type: 'deduction',
        amount,
        note: `القسط ${loan.paidInstallments + 1} من ${loan.installmentsCount} — متبقٍ ${remaining.toFixed(3)} د.ك`,
        loanId: loan.id,
      });
    }

    // استرجاع البنود اليدوية المحفوظة (تعديلات المحاسب تبقى بعد إعادة الحساب)
    for (const m of manualByEmp.get(emp.id) || []) {
      items.push({ ...m, type: m.type === 'deduction' ? 'deduction' : 'earning', note: m.note ?? undefined, source: 'manual' });
    }

    // الإجماليات بتقريب موحد
    const totalEarnings = round3(items.filter((i) => i.type === 'earning').reduce((s, i) => s + i.amount, 0));
    const totalDeductions = round3(items.filter((i) => i.type === 'deduction').reduce((s, i) => s + i.amount, 0));
    const netPay = round3(totalEarnings - totalDeductions);
    totalNet = round3(totalNet + netPay);

    const notes: string[] = [];
    if (!emp.otEligible && computedOt > 0) {
      notes.push(`إضافي غير مصروف: ${((weekdayOtMinutes + holidayOtMinutes) / 60).toFixed(1)} ساعة = ${computedOt.toFixed(3)} د.ك — فعّل «يستحق الإضافي» في ملف الموظف لصرفه`);
    }
    if (emp.attendanceExempt) notes.push('معفى من البصمة — راتب كامل');
    if (missedPunchDays > 0) notes.push(`${missedPunchDays} يوم بصمة ناقصة (missed_punch) بلا خصم — راجعه`);
    if (departKey && departKey >= keys[0] && departKey <= keys[keys.length - 1]) {
      notes.push('حُسبت قسيمة منتصف الشهر حتى تاريخ ترك العمل');
    }

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
        paidLeaveDays,
        unpaidLeaveDays,
        holidayDays,
        weekOffDays,
        dayLedger: JSON.stringify(ledger),
        otHours: round3((weekdayOtMinutes + holidayOtMinutes) / 60),
        otAmount: otVal,
        lateMinutes,
        lateDeduction,
        absenceDeduction,
        status: 'draft',
        notes: notes.join(' — ') || null,
      },
    });

    if (items.length) {
      await db.payslipItem.createMany({
        data: items.map((i) => ({
          payslipId: payslip.id,
          componentId: i.componentId ?? null,
          name: i.name,
          type: i.type,
          amount: i.amount,
          note: i.note || null,
          source: i.source || 'auto',
          editedBy: i.editedBy ?? null,
          editedAt: i.editedAt ?? null,
          loanId: i.loanId ?? null,
        })),
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
