// /api/leaves/[id]/settlement — بيانات تسوية الإجازة المقدمة (نموذج مطابق للعينة)
// رصيد الإجازة قبل/بعد + تفصيل شهري (أيام عمل مقابل أيام إجازة بقيمة اليوم) + إجمالي المقدّم
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok, HttpError } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { vacationBalance, vacationAdvanceBreakdown } from '@/lib/vacation';
import { round3 } from '@/lib/calc';

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

    // أيام عمل الأسبوع: من وردية الموظف النشطة أو الافتراضي
    let workDays: number[] = [0, 1, 2, 3, 4];
    const assignment = await db.shiftAssignment.findFirst({
      where: { employeeId: leave.employeeId, fromDate: { lte: leave.toDate } },
      orderBy: { fromDate: 'desc' },
    });
    if (assignment) {
      const shift = await db.shift.findUnique({ where: { id: assignment.shiftId } });
      if (shift) {
        try {
          const arr = JSON.parse(shift.workDays);
          if (Array.isArray(arr)) workDays = arr.map(Number);
        } catch {}
      }
    }

    // الرصيد قبل الإجازة (حتى يوم ما قبل البداية) وبعدها
    const before = await vacationBalance(
      leave.employeeId, leave.employee.hireDate, settings.vacationAnnualQuota ?? 30,
      new Date(leave.fromDate.getTime() - 24 * 3600_000),
    );
    const after = { ...before, balance: round3(before.balance - Number(leave.days)) };

    const breakdown = vacationAdvanceBreakdown(
      leave.fromDate, leave.toDate, Number(leave.days), basic, settings.workDaysPerMonth, workDays,
    );

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
