// /api/ess/me — الصفحة الرئيسية لبوابة الموظف: الملف + الأرصدة + آخر قسيمة + عدد الطلبات
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok, HttpError } from '@/lib/api';
import { requireEmployee, RELEASED_PERIOD_STATUSES } from '@/lib/ess';
import { getSettings } from '@/lib/settings';
import { vacationBalance } from '@/lib/vacation';
import { offDaysText } from '@/lib/workweek';
import { dateKey } from '@/lib/time';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { employeeId } = await requireEmployee(req);
    const settings = await getSettings();
    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });
    if (!emp) throw new HttpError(404, 'ملف الموظف غير موجود');

    const annual = await vacationBalance(employeeId, emp.hireDate, settings.vacationAnnualQuota ?? 30);

    // استهلاك أنواع الإجازات ذات الحصة السنوية (مثل المرضية) خلال السنة الحالية
    const yearStart = new Date(`${dateKey().slice(0, 4)}-01-01T00:00:00.000+03:00`);
    const types = await db.leaveType.findMany({ where: { active: true } });
    const approved = await db.leaveRequest.findMany({
      where: { employeeId, status: 'approved', fromDate: { gte: yearStart } },
      select: { leaveTypeId: true, days: true },
    });
    const usedBy = new Map<string, number>();
    for (const l of approved) usedBy.set(l.leaveTypeId, (usedBy.get(l.leaveTypeId) || 0) + Number(l.days));
    const balances = types
      .filter((t) => t.quotaDays && !/annual/i.test(t.code))
      .map((t) => {
        const used = usedBy.get(t.id) || 0;
        return { id: t.id, name: t.name, quota: t.quotaDays || 0, used, balance: (t.quotaDays || 0) - used };
      });

    const lastSlip = await db.payslip.findFirst({
      where: { employeeId, period: { status: { in: RELEASED_PERIOD_STATUSES } } },
      include: { period: { select: { name: true } } },
      orderBy: { period: { startDate: 'desc' } },
    });
    const pendingRequests = await db.employeeRequest.count({ where: { employeeId, status: 'pending' } });
    // العهد المسجلة على الموظف (غير المُستلمة)
    const custodies = await db.custody.findMany({
      where: { employeeId, status: { in: ['issued', 'lost', 'damaged'] } },
      select: { itemName: true, serialNo: true, quantity: true, issuedAt: true, status: true },
      orderBy: { issuedAt: 'desc' },
    });

    return ok({
      companyName: settings.companyName,
      employee: {
        id: emp.id, code: emp.code, name: emp.name, email: emp.email, phone: emp.phone,
        department: emp.department?.name || null, position: emp.position?.name || null,
        manager: emp.manager?.name || null, hireDate: emp.hireDate, nationality: emp.nationality,
        photoId: emp.photoId, weeklyOff: offDaysText(emp.weeklyOffDays),
      },
      annual,
      balances,
      lastPayslip: lastSlip ? { id: lastSlip.id, period: lastSlip.period.name, netPay: lastSlip.netPay } : null,
      pendingRequests,
      custodies,
    });
  });
}
