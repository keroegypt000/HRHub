import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { vacationBalance } from '@/lib/vacation';
import { fullWage } from '@/lib/indemnity';
import { round3 } from '@/lib/calc';
import { dateKey } from '@/lib/time';

/**
 * أرصدة الإجازات السنوية لكل الموظفين حتى تاريخ معين — نفس حساب كارت الموظف ونهاية الخدمة:
 * المستحق = الحصة السنوية × أيام الخدمة ÷ 365 (أو الرصيد الافتتاحي + ما بعده) − المستخدم
 * القيمة = الرصيد × (الراتب الشهري الكامل ÷ أيام الشهر المعتمدة)
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'leaves');
    const url = new URL(req.url);
    const asOfKey = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('asOf') || '') ? String(url.searchParams.get('asOf')) : dateKey();
    // اليوم = نفس لحظة كارت الموظف (الآن)، وأي تاريخ آخر = بداية ذلك اليوم
    const asOf = asOfKey === dateKey() ? new Date() : new Date(`${asOfKey}T00:00:00.000+03:00`);
    const settings = await getSettings();
    const quota = settings.vacationAnnualQuota ?? 30;
    const perMonth = settings.workDaysPerMonth > 0 ? settings.workDaysPerMonth : 26;

    const employees = await db.employee.findMany({
      where: { status: { notIn: ['terminated', 'deceased'] } },
      include: {
        department: { select: { id: true, name: true } },
        contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 },
        leaveRequests: {
          where: { status: 'approved' },
          select: { days: true, fromDate: true, leaveType: { select: { name: true, paid: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });

    interface BalanceRow {
      id: string; employee: { id: string; name: string; code: string; department: { id: string; name: string } | null };
      hireDate: Date | null; opening: { balance: number; date: Date } | null;
      accrued: number; used: number; balance: number; monthly: number; dayRate: number; value: number;
      leavesTaken: Record<string, number>; noHireDate: boolean;
    }
    const rows: BalanceRow[] = [];
    for (const emp of employees) {
      const bal = await vacationBalance(emp.id, emp.hireDate, quota, asOf);
      const c = emp.contracts[0];
      const monthly = fullWage({ basic: c?.basicSalary ?? emp.basicSalary, housing: c?.housingAllowance ?? 0, transport: c?.transportAllowance ?? 0, other: c?.otherAllowance ?? 0 });
      const dayRate = round3(monthly / perMonth);
      // إجازات أخرى مأخوذة (مرضية/طارئة/بدون راتب...) للعلم
      const other: Record<string, number> = {};
      for (const l of emp.leaveRequests) {
        const n = l.leaveType?.name || 'أخرى';
        other[n] = round3((other[n] || 0) + Number(l.days));
      }
      rows.push({
        id: emp.id,
        employee: { id: emp.id, name: emp.name, code: emp.code, department: emp.department },
        hireDate: emp.hireDate,
        opening: emp.openingLeaveBalance !== null && emp.openingLeaveDate ? { balance: emp.openingLeaveBalance, date: emp.openingLeaveDate } : null,
        accrued: bal.accrued,
        used: bal.used,
        balance: bal.balance,
        monthly,
        dayRate,
        value: round3(Math.max(0, bal.balance) * dayRate),
        leavesTaken: other,
        noHireDate: !emp.hireDate && !(emp.openingLeaveDate && emp.openingLeaveBalance !== null),
      });
    }

    const sum = (f: (r: BalanceRow) => number) => round3(rows.reduce((s, r) => s + f(r), 0));
    return ok({
      asOf: asOfKey,
      quota,
      perMonth,
      rows,
      totals: {
        employees: rows.length,
        accrued: sum((r) => r.accrued),
        used: sum((r) => r.used),
        balance: sum((r) => r.balance),
        value: sum((r) => r.value),
        negative: rows.filter((r) => r.balance < 0).length,
        noHireDate: rows.filter((r) => r.noHireDate).length,
      },
    });
  });
}
