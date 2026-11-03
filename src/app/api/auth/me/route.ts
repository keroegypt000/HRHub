import { NextRequest } from 'next/server';
import { requireUser, ok, handle } from '@/lib/api';
import { canWrite } from '@/lib/auth';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    return ok({
      id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions,
      can: {
        // الخريطة التي تعتمدها الواجهة لإخفاء أزرار الكتابة
        employees: canWrite(user, 'employees'),
        departments: canWrite(user, 'departments'),
        positions: canWrite(user, 'positions'),
        contracts: canWrite(user, 'contracts'),
        shifts: canWrite(user, 'shifts'),
        leaveTypes: canWrite(user, 'leave-types'),
        leaves: canWrite(user, 'leaves'),
        leaveApprove: canWrite(user, 'leave-approve'),
        holidays: canWrite(user, 'holidays'),
        devices: canWrite(user, 'devices'),
        attendanceLogs: canWrite(user, 'attendance-logs'),
        dailyAttendance: canWrite(user, 'daily-attendance'),
        payroll: canWrite(user, 'payroll-periods'),
        salaryComponents: canWrite(user, 'salary-components'),
        users: canWrite(user, 'users'),
        settings: canWrite(user, 'settings'),
        import: canWrite(user, 'import'),
        export: canWrite(user, 'export'),
        // الأقسام الجديدة: التنبيهات ونهاية الخدمة والمستحقات
        passports: canWrite(user, 'passports'),
        iqamas: canWrite(user, 'iqamas'),
        vehicles: canWrite(user, 'vehicles'),
        companyContracts: canWrite(user, 'company-contracts'),
        settlements: canWrite(user, 'settlements'),
        // الطلبات والموافقات والقروض
        requests: canWrite(user, 'requests'),
        workflow: canWrite(user, 'workflow'),
        loans: canWrite(user, 'loans'),
      },
    });
  });
}
