// /api/leaves/[id]/settlement — بيانات تسوية الإجازة المقدمة (نموذج مطابق للعينة)
// رصيد الإجازة قبل/بعد + تفصيل شهري (أيام عمل مقابل أيام إجازة بقيمة اليوم) + إجمالي المقدّم
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok, HttpError } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { vacationBalance, vacationAdvanceBreakdown } from '@/lib/vacation';
import { round3 } from '@/lib/calc';
import { effectiveWorkDays } from '@/lib/workweek';
import { resolveShift } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'leaves');
    const { id } = await ctx.params;

    const leave = await db.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
            contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 },
          },
        },
        leaveType: true,
      },
    });
    if (!leave) throw new HttpError(404, 'طلب الإجازة غير موجود');
    if (!leave.employee.hireDate) throw new HttpError(400, 'لا يوجد تاريخ تعيين للموظف — أدخله أولًا');

    const settings = await getSettings();
    const contract = leave.employee.contracts[0];
    const basic = round3(contract?.basicSalary ?? leave.employee.basicSalary ?? 0);

    // أيام عمل الموظف: أيام راحته الخاصة ← ورديته في بداية الإجازة ← الافتراضي
    const { shift } = await resolveShift(leave.employeeId, dateKey(leave.fromDate));
    const workDays = effectiveWorkDays(leave.employee.weeklyOffDays, shift?.workDays);

    // الرصيد قبل الإجازة (حتى يوم ما قبل البداية) وبعدها
    const before = await vacationBalance(
      leave.employeeId, leave.employee.hireDate, settings.vacationAnnualQuota ?? 30,
      new Date(leave.fromDate.getTime() - 24 * 3600_000),
    );
    const breakdown = vacationAdvanceBreakdown(
      leave.fromDate, leave.toDate, basic, settings.workDaysPerMonth, workDays, leave.employee.hireDate,
    );
    const after = { ...before, balance: round3(before.balance - breakdown.periodDays) };

    return ok({
      leave: {
        id: leave.id, fromDate: leave.fromDate, toDate: leave.toDate, days: leave.days,
        reason: leave.reason, status: leave.status,
        typeName: leave.leaveType.name, typePaid: leave.leaveType.paid,
      },
      employee: {
        id: leave.employee.id, code: leave.employee.code, name: leave.employee.name,
        department: leave.employee.department?.name || null,
        position: leave.employee.position?.name || null,
        nationality: leave.employee.nationality,
        civilId: leave.employee.civilId,
        bankAccount: leave.employee.bankAccount,
        hireDate: leave.employee.hireDate,
      },
      basicSalary: basic,
      balanceBefore: before.balance,
      balanceAfter: after.balance,
      annualQuota: settings.vacationAnnualQuota ?? 30,
      breakdown,
      workDaysPerMonth: settings.workDaysPerMonth,
    });
  });
}
