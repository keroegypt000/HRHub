import { db } from '@/lib/db';
import { ok, handle } from '@/lib/api';
import { NextRequest } from 'next/server';

/**
 * فحص صحة النظام.
 * ?quick=1 → استعلام واحد فقط (SELECT 1) لفحص الوصول للقاعدة — مثالي للزر في شاشة الدخول
 *            لأنه لا يستهلك حصة العمليات ولا يعلّق عند توقّف القاعدة.
 * بدون quick → فحص شامل: كل الجداول + سلامة العلاقات (27+ استعلام — استخدمه يدويًا فقط).
 */
export async function GET(req: NextRequest) {
  const quick = new URL(req.url).searchParams.get('quick') === '1';

  if (quick) {
    try {
      await db.$queryRaw`SELECT 1`;
      return ok({ status: 'healthy', connected: true, quick: true, checkedAt: new Date().toISOString() });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      // 200 عمدًا حتى يقرأ الواجهة النتيجة بسهولة — الحكم على connected
      return ok({
        status: 'unreachable',
        connected: false,
        quick: true,
        code: e?.code || null,
        error: (e?.message || 'خطأ غير معروف').replace(/\s+/g, ' ').slice(0, 300),
        checkedAt: new Date().toISOString(),
      });
    }
  }

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
      ['Passport', () => db.passport.count()],
      ['Vehicle', () => db.vehicle.count()],
      ['CompanyContract', () => db.companyContract.count()],
      ['DepartureSettlement', () => db.departureSettlement.count()],
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
        const err = e as { code?: string; message?: string; meta?: Record<string, unknown> };
        const code = err.code || '';
        const target = err.meta ? JSON.stringify(err.meta) : '';
        tables[name] = `MISSING/ERROR: ${code ? `[${code}] ` : ''}${(err.message || 'خطأ').slice(0, 120)} ${target}`.trim();
      }
    }

    // فحوص سلامة العلاقات (بيانات مُرحّلة قد تكون ناقصة)
    const integrity: Record<string, unknown> = {};
    try {
      const [empNoDept, contractsNoEmp, danglingRenewal, empNoPin, passportsNoExpiry] = await Promise.all([
        db.employee.count({ where: { departmentId: { not: null }, department: { is: null } } }),
        db.contract.count({ where: { status: 'active', employee: { status: { not: 'active' } } } }),
        db.contract.count({ where: { renewalOfId: { not: null }, renewalOf: { is: null } } }),
        db.employee.count({ where: { status: 'active', pin: null } }),
        db.passport.count(),
      ]);
      integrity.employeesWithMissingDepartment = empNoDept;
      integrity.contractsWithMissingEmployee = contractsNoEmp;
      integrity.contractsWithBrokenRenewalChain = danglingRenewal;
      integrity.activeEmployeesWithoutPin = empNoPin;
      integrity.passportsTotal = passportsNoExpiry;
      integrity.ok = true;
    } catch (e) {
      integrity.ok = false;
      integrity.error = e instanceof Error ? e.message.slice(0, 200) : 'خطأ فحص العلاقات';
    }

    return ok({
      status: allOk ? 'healthy' : 'degraded',
      database: mode,
      connected: true,
      tablesChecked: models.length,
      tables,
      integrity,
      checkedAt: new Date().toISOString(),
    });
  });
}
