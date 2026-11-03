import { NextRequest } from 'next/server';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { getSettings, saveSettings, encryptSecret } from '@/lib/settings';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/** الإعدادات بدون الأسرار المشفرة — تُرجع فقط هل كلمة السر محفوظة */
function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    ...s,
    biotimePasswordEnc: undefined, hasBiotimePassword: !!s.biotimePasswordEnc,
    smtpPasswordEnc: undefined, hasSmtpPassword: !!s.smtpPasswordEnc,
  };
}

/** قراءة الإعدادات — المدير كل شيء؛ البقية يرون اسم الجهة فقط */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'settings');
    const s = await getSettings();
    if (user.role !== 'admin') {
      return ok({ companyName: s.companyName });
    }
    return ok(publicSettings(s));
  });
}

/** حفظ الإعدادات — مدير فقط */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const admin = await requireWrite(req, 'settings');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedKeys = [
      'companyName', 'workDaysPerMonth', 'hoursPerDay', 'otWeekdayMult', 'otHolidayMult',
      'lateDeductionMode', 'socialSecurityEnabled', 'sscEmployeeCitizen', 'sscEmployerCitizen',
      'sscEmployerExpatriate', 'defaultShiftId', 'autoAcceptDevices', 'admsEnabled',
      'biotimeEnabled', 'biotimeUrl', 'biotimeUsername', 'biotimeAutoSyncMinutes', 'deviceOfflineAlertMinutes',
      'companyLogoFileId', 'vacationAnnualQuota', 'eosResignTiers', 'eosBasisDefault',
      'attendanceStartDate', 'emailEnabled', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpFrom', 'appUrl',
    ];
    const updates: Record<string, string | boolean | number> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined && body[key] !== null) {
        updates[key] = typeof body[key] === 'boolean' ? (body[key] as boolean) : String(body[key]);
      }
    }
    if (typeof body.biotimePassword === 'string' && body.biotimePassword) {
      updates.biotimePasswordEnc = encryptSecret(body.biotimePassword);
    }
    if (typeof body.smtpPassword === 'string' && body.smtpPassword) {
      updates.smtpPasswordEnc = encryptSecret(body.smtpPassword);
    }
    await saveSettings(updates);
    await logAudit({
      userId: admin.id, action: 'update', entity: 'settings',
      description: `تحديث الإعدادات (${Object.keys(updates).join('، ')})`,
    });
    const s = await getSettings();
    return ok(publicSettings(s));
  });
}

/** مسح البيانات التجريبية — مدير فقط */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const admin = await requireWrite(req, 'settings');
    await db.attendanceLog.deleteMany({});
    await db.dailyAttendance.deleteMany({});
    await db.payslip.deleteMany({});
    await db.payrollPeriod.deleteMany({});
    await db.leaveRequest.deleteMany({});
    await db.shiftAssignment.deleteMany({});
    await db.contract.deleteMany({});
    await logAudit({ userId: admin.id, action: 'reset', entity: 'settings', description: 'مسح البيانات التشغيلية (سجلات، حضور، رواتب، إجازات، عقود) — أبقى الموظفين والأقسام والأجهزة' });
    return ok({ cleared: true });
  });
}
