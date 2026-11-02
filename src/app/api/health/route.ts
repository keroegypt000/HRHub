import { db } from '@/lib/db';
import { ok, handle } from '@/lib/api';

/** فحص صحة النظام: الاتصال بقاعدة البيانات + وجود كل الجداول (بدون بيانات حساسة) */
export async function GET() {
  return handle(async () => {
    const url = process.env.DATABASE_URL || '';
    const mode = url.startsWith('prisma+')
      ? 'prisma-postgres-accelerate'
      : url.startsWith('postgres')
        ? 'postgresql-direct'
        : url.startsWith('file:')
          ? 'sqlite'
          : 'unknown';

    const models: [string, () => Promise<number>][] = [
      ['User', () => db.user.count()],
      ['Session', () => db.session.count()],
      ['AuditLog', () => db.auditLog.count()],
      ['RestorePoint', () => db.restorePoint.count()],
      ['FileUpload', () => db.fileUpload.count()],
      ['ImportLog', () => db.importLog.count()],
      ['Department', () => db.department.count()],
      ['Position', () => db.position.count()],
      ['Employee', () => db.employee.count()],
      ['Contract', () => db.contract.count()],
      ['Device', () => db.device.count()],
      ['AttendanceLog', () => db.attendanceLog.count()],
      ['Shift', () => db.shift.count()],
      ['ShiftAssignment', () => db.shiftAssignment.count()],
      ['DailyAttendance', () => db.dailyAttendance.count()],
      ['LeaveType', () => db.leaveType.count()],
      ['LeaveRequest', () => db.leaveRequest.count()],
      ['Holiday', () => db.holiday.count()],
      ['SalaryComponent', () => db.salaryComponent.count()],
      ['PayrollPeriod', () => db.payrollPeriod.count()],
      ['Payslip', () => db.payslip.count()],
      ['PayslipItem', () => db.payslipItem.count()],
      ['Setting', () => db.setting.count()],
    ];

    const tables: Record<string, string> = {};
    let allOk = true;
    for (const [name, q] of models) {
      try {
        tables[name] = `ok (${await q()})`;
      } catch (e) {
        allOk = false;
        tables[name] = `MISSING/ERROR: ${e instanceof Error ? e.message.slice(0, 140) : 'خطأ'}`;
      }
    }

    return ok({
      status: allOk ? 'healthy' : 'degraded',
      database: mode,
      connected: true,
      tables,
      checkedAt: new Date().toISOString(),
    });
  });
}
