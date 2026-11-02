import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { getSettings, decryptSecret } from '@/lib/settings';
import { btLogin, btEmployees, btDevices, btTransactions } from '@/lib/zk/biotime';
import { parseDeviceTime } from '@/lib/zk/protocol';
import { logAudit } from '@/lib/audit';
import { resolveEmployeeByPin, recomputeDayForEmployees } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

/** مزامنة من خادم BioTime قائم (REST API) — الوضع الثاني لجلب السجلات */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
    const settings = await getSettings();

    if (!settings.biotimeEnabled || !settings.biotimeUrl || !settings.biotimePasswordEnc) {
      return fail(400, 'مزامنة BioTime غير مفعلة — اضبطها من صفحة الإعدادات (مدير فقط)');
    }
    const password = decryptSecret(settings.biotimePasswordEnc);
    if (!password) return fail(400, 'بيانات اعتماد BioTime غير صالحة — حدّثها من الإعدادات');

    const creds = { url: settings.biotimeUrl, username: settings.biotimeUsername, password };
    const token = await btLogin(creds);

    const stats = { employees: 0, devices: 0, transactions: 0, inserted: 0, duplicates: 0, errors: [] as string[] };
    const affectedEmployees: string[] = [];

    try {
      // الأجهزة
      const devices = await btDevices(creds.url, token);
      for (const d of devices) {
        const sn = String(d.serial_number || d.sn || '');
        if (!sn) continue;
        await db.device.upsert({
          where: { sn },
          update: { name: String(d.alias || d.device_name || sn), model: d.device_type ? String(d.device_type) : undefined },
          create: { sn, name: String(d.alias || d.device_name || sn), model: d.device_type ? String(d.device_type) : undefined },
        }).catch(() => {});
        stats.devices++;
      }
    } catch (e) {
      stats.errors.push(`الأجهزة: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      // الموظفون — تحديث pin للموظفين الموجودين بـ code
      const emps = await btEmployees(creds.url, token);
      for (const e of emps) {
        const code = String(e.emp_code || '');
        if (!code) continue;
        await db.employee.updateMany({ where: { code }, data: { pin: code } });
        stats.employees++;
      }
    } catch (e) {
      stats.errors.push(`الموظفون: ${e instanceof Error ? e.message : String(e)}`);
    }

    // السجلات
    try {
      const toStr = body.to || dateKey();
      const fromStr = body.from || dateKey(new Date(Date.now() - 7 * 86400_000));
      const txs = await btTransactions(creds.url, token, `${fromStr} 00:00:00`, `${toStr} 23:59:59`);
      for (const t of txs) {
        const pin = String(t.emp_code || '');
        const sn = String(t.terminal_sn || 'BIOTIME');
        const punchTime = t.punch_time ? parseDeviceTime(String(t.punch_time)) : null;
        if (!pin || !punchTime) continue;
        stats.transactions++;
        const emp = await resolveEmployeeByPin(pin);
        try {
          await db.attendanceLog.create({
            data: {
              sn,
              pin,
              employeeId: emp?.id || null,
              punchTime,
              status: Number(t.punch_state || 0),
              verify: Number(t.verify_type || 1),
              source: 'biotime',
            },
          });
          stats.inserted++;
          if (emp && !affectedEmployees.includes(emp.id)) affectedEmployees.push(emp.id);
        } catch {
          stats.duplicates++;
        }
      }
      const { recomputeRange } = await import('@/lib/attendance');
      const today = dateKey();
      const fromKey = fromStr < today ? fromStr : today;
      await recomputeRange({ from: fromKey, to: today }).catch(() => {});
    } catch (e) {
      stats.errors.push(`السجلات: ${e instanceof Error ? e.message : String(e)}`);
    }

    await logAudit({
      userId: user.id, action: 'sync', entity: 'device',
      description: `مزامنة BioTime: ${stats.inserted} سجلة جديدة (${stats.duplicates} مكررة)`,
      changes: stats,
    });
    return ok({ synced: true, ...stats });
  });
}
