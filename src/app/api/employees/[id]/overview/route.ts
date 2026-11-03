// /api/employees/[id]/overview — صفحة الموظف الشاملة: كل ما يخص الموظف في طلب واحد
// البيانات + الراتب + رصيد الإجازة + حضور الشهر + الطلبات + السلف + المستندات + نهاية الخدمة
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok, HttpError } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { vacationBalance } from '@/lib/vacation';
import { round3 } from '@/lib/calc';
import { dateKey, kuwaitMidnight, daysInMonth } from '@/lib/time';
import { offDaysText } from '@/lib/workweek';
import {
  indemnityFullByDays, capIndemnity, servicePeriodPercent, parseResignTiers, eosWage, normalizeEosBasis, fullWage,
} from '@/lib/indemnity';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'employees');
    const { id } = await ctx.params;
    const settings = await getSettings();

    const emp = await db.employee.findUnique({
      where: { id },
      include: {
        department: true, position: true,
        manager: { select: { id: true, name: true, code: true } },
        photo: { select: { id: true } },
        contracts: { orderBy: { startDate: 'desc' } },
        shiftAssignments: { orderBy: { fromDate: 'desc' }, include: { shift: true }, take: 5 },
        leaveRequests: { orderBy: { fromDate: 'desc' }, include: { leaveType: true }, take: 50 },
        payslips: { orderBy: { createdAt: 'desc' }, include: { period: true }, take: 12 },
        files: { orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, ownerTag: true } },
        passports: { orderBy: { expiryDate: 'desc' } },
        iqamas: { orderBy: { expiryDate: 'desc' } },
        loans: { orderBy: { createdAt: 'desc' } },
        requests: { orderBy: { createdAt: 'desc' }, take: 30 },
        settlements: true,
        userAccount: { select: { username: true, active: true } },
      },
    });
    if (!emp) throw new HttpError(404, 'الموظف غير موجود');

    // الراتب الشهري من العقد النشط
    const contract = emp.contracts.find((c) => c.status === 'active') || null;
    const wage = {
      basic: contract?.basicSalary ?? emp.basicSalary,
      housing: contract?.housingAllowance ?? 0,
      transport: contract?.transportAllowance ?? 0,
      other: contract?.otherAllowance ?? 0,
    };

    // حضور الشهر المختار (افتراضيًا الحالي)
    const m = new URL(req.url).searchParams.get('month');
    const month = m && /^\d{4}-\d{2}$/.test(m) ? m : dateKey().slice(0, 7);
    const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const attendance = await db.dailyAttendance.findMany({
      where: { employeeId: id, date: { gte: kuwaitMidnight(`${month}-01`), lte: kuwaitMidnight(lastDay) } },
      orderBy: { date: 'asc' },
      select: { date: true, firstIn: true, lastOut: true, workedMinutes: true, lateMinutes: true, earlyMinutes: true, otMinutes: true, status: true, note: true },
    });
    const count = (s: string[]) => attendance.filter((a) => s.includes(a.status)).length;
    const attendanceSummary = {
      month,
      present: count(['present', 'late', 'half_day']),
      late: count(['late']),
      absent: count(['absent']),
      missedPunch: count(['missed_punch']),
      leave: count(['leave']),
      lateMinutes: attendance.reduce((s, a) => s + a.lateMinutes, 0),
      otMinutes: attendance.reduce((s, a) => s + a.otMinutes, 0),
      workedMinutes: attendance.reduce((s, a) => s + a.workedMinutes, 0),
    };

    // رصيد الإجازة السنوية
    const annual = await vacationBalance(id, emp.hireDate, settings.vacationAnnualQuota ?? 30);

    // تقدير نهاية الخدمة حتى اليوم
    const basis = normalizeEosBasis(emp.eosBasis, normalizeEosBasis(settings.eosBasisDefault));
    const eosWageValue = eosWage(wage, basis);
    const today = kuwaitMidnight(dateKey());
    const eosFull = emp.hireDate ? capIndemnity(indemnityFullByDays(eosWageValue, emp.hireDate, today), eosWageValue) : 0;
    const years = emp.hireDate ? Math.round(((today.getTime() - emp.hireDate.getTime()) / (365 * 86400_000)) * 100) / 100 : 0;
    const tiers = parseResignTiers(settings.eosResignTiers);

    // المستندات: أقرب انتهاء
    const docs = [
      ...emp.passports.map((p) => ({ kind: 'جواز', no: p.passportNo, expiry: p.expiryDate })),
      ...emp.iqamas.map((q) => ({ kind: 'إقامة', no: q.iqamaNo, expiry: q.expiryDate })),
      ...emp.contracts.filter((c) => c.status === 'active' && c.endDate).map((c) => ({ kind: 'عقد', no: c.contractNo, expiry: c.endDate! })),
    ].sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
    const daysLeft = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400_000);

    const loansOutstanding = round3(emp.loans.filter((l) => l.status === 'active').reduce((s, l) => s + (l.totalAmount - l.paidAmount), 0));

    return ok({
      employee: {
        ...emp,
        weeklyOffText: offDaysText(emp.weeklyOffDays) || 'حسب الوردية',
        eosBasis: basis,
      },
      contract,
      wage: { ...wage, total: fullWage(wage) },
      attendance, attendanceSummary,
      annual,
      eos: {
        years, basis, wage: eosWageValue, full: round3(eosFull),
        ifResigned: round3(eosFull * servicePeriodPercent('resigned', years, tiers) / 100),
        ifTerminated: round3(eosFull),
      },
      documents: docs.map((d) => ({ ...d, daysLeft: daysLeft(d.expiry) })),
      loansOutstanding,
      pendingRequests: emp.requests.filter((r) => r.status === 'pending').length,
      currentShift: emp.shiftAssignments[0]?.shift?.name || null,
    });
  });
}
