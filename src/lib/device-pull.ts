// lib/device-pull.ts — سحب البصمات من جهاز على الشبكة المحلية (ZKTeco 4370 أو ACTAtek REST/SOAP)
// يستخدمه زر «سحب الآن» في صفحة الأجهزة + السحب التلقائي في النسخة المكتبية
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { pullFromLocalDevice, getLocalDeviceUsers, LocalDeviceError } from '@/lib/zk/local';
import { pullFromActatek, getActatekUsers, ActatekError } from '@/lib/actatek';
import { linkPunchesToEmployees } from '@/lib/link-punches';
import { savePunchPhoto, punchPhotoKey } from '@/lib/zk/photos';
import { resolveEmployeeByPin, recomputeRange } from '@/lib/attendance';
import { decryptSecret } from '@/lib/settings';

export class DevicePullError extends Error {}

const dayKey = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export interface DevicePullResult {
  pulled: true; deviceSn: string; totalOnDevice: number; inserted: number; duplicates: number;
  photos: number; daysRecomputed: number; matchedUsers: number; usersOnDevice: number;
  durationMs: number; message: string; api?: string;
}

export async function pullDevice(deviceId: string, userId?: string | null): Promise<DevicePullResult> {
  const started = Date.now();
  const device = await db.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new DevicePullError('الجهاز غير موجود');
  if (!device.enabled) throw new DevicePullError('الجهاز معطّل — فعّله أولًا');
  if (!device.ipAddress) throw new DevicePullError('لم يُسجَّل عنوان IP للجهاز — عدّل الجهاز وأدخل IP الشبكة الخاص به');

  let sn = device.sn;
  let punches: { pin: string; punchTime: Date; status: number; verify: number; photo?: Buffer; workCode?: string }[] = [];
  let users: { pin: string; name: string }[] = [];
  let source = 'local';
  let api: string | undefined;

  if (device.vendor === 'actatek') {
    if (!device.apiUser || !device.apiPassword) throw new DevicePullError('أدخل اسم مستخدم وكلمة سر جهاز ACTAtek في بيانات الجهاز');
    // أول سحب: آخر 60 يومًا — بعدها من آخر سحب ناقص يومين (تغطية أي تأخير)
    const from = device.lastPullAt ? new Date(device.lastPullAt.getTime() - 2 * 86400_000) : new Date(Date.now() - 60 * 86400_000);
    try {
      const r = await pullFromActatek({
        ip: device.ipAddress, port: device.port && device.port !== 4370 ? device.port : null, https: device.useHttps,
        username: device.apiUser, password: decryptSecret(device.apiPassword),
      }, from, new Date(Date.now() + 3600_000));
      api = r.api;
      source = 'actatek';
      punches = r.punches.map((p) => ({ pin: p.pin, punchTime: p.punchTime, status: p.status, verify: p.accessMethod === 'FACE' ? 15 : 1, photo: p.photo, workCode: p.trigger }));
      users = r.punches.filter((p) => p.userName).map((p) => ({ pin: p.pin, name: p.userName as string }));
      if (r.punches[0]?.terminalSN) sn = r.punches[0].terminalSN;
    } catch (e) {
      throw new DevicePullError(e instanceof ActatekError ? e.message : `تعذر الاتصال بجهاز ACTAtek ${device.ipAddress}`);
    }
  } else {
    try {
      const r = await pullFromLocalDevice({ ip: device.ipAddress, port: device.port || 4370, timeoutMs: 8000, commKey: device.commKey || undefined });
      punches = r.punches;
      users = r.users;
      sn = r.info.sn?.trim() || device.sn;
    } catch (e) {
      if (e instanceof LocalDeviceError) throw new DevicePullError(e.message);
      throw new DevicePullError(`تعذر الاتصال بالجهاز المحلي ${device.ipAddress} — تأكد أن هذا الجهاز يصل إليه على المنفذ ${device.port || 4370}`);
    }
  }
  // ACTAtek: السجلات تُحفظ باسم SN المسجل للجهاز (العلاقة بجدول الأجهزة)
  if (device.vendor === 'actatek') sn = device.sn;

  let inserted = 0; let duplicates = 0; let photos = 0;
  const days = new Set<string>();
  for (const p of punches) {
    const emp = await resolveEmployeeByPin(p.pin);
    try {
      await db.attendanceLog.create({
        data: { sn, pin: p.pin, employeeId: emp?.id || null, punchTime: p.punchTime, status: p.status, verify: p.verify, workCode: p.workCode || null, source },
      });
      inserted++;
      days.add(dayKey(p.punchTime));
    } catch {
      duplicates++;
    }
    if (p.photo && await savePunchPhoto(sn, { pin: p.pin, punchTime: p.punchTime, fileName: punchPhotoKey(sn, p.pin, p.punchTime), data: p.photo }).catch(() => false)) photos++;
  }

  // ربط موظفين بلا PIN بالاسم المسجل على الجهاز
  let matchedUsers = 0;
  const seen = new Set<string>();
  for (const u of users) {
    if (!u.name || seen.has(u.pin)) continue;
    seen.add(u.pin);
    if (await resolveEmployeeByPin(u.pin)) continue;
    const byName = await db.employee.findFirst({ where: { name: u.name, pin: null } });
    if (byName) { await db.employee.update({ where: { id: byName.id }, data: { pin: u.pin } }); matchedUsers++; }
  }

  const sorted = [...days].sort();
  if (sorted.length) await recomputeRange({ from: sorted[0], to: sorted[sorted.length - 1] }).catch(() => {});

  await db.device.update({
    where: { id: device.id },
    data: {
      lastPullAt: new Date(), lastSeenAt: new Date(), status: 'online',
      sn: sn !== device.sn && !(await db.device.findUnique({ where: { sn } })) ? sn : device.sn,
    },
  });

  if (inserted || userId) {
    await logAudit({
      userId: userId || undefined, action: 'sync', entity: 'device', entityId: device.id,
      description: `سحب من ${device.name} (${device.ipAddress}${api ? ` — ACTAtek ${api.toUpperCase()}` : ''}): ${inserted} سجلة جديدة، ${duplicates} مكررة، ${photos} صورة`,
    });
  }

  return {
    pulled: true, deviceSn: sn, totalOnDevice: punches.length, inserted, duplicates, photos,
    daysRecomputed: sorted.length, matchedUsers, usersOnDevice: users.length, durationMs: Date.now() - started, api,
    message: inserted
      ? `تم سحب ${inserted} سجلة جديدة${photos ? ` و${photos} صورة` : ''} (${duplicates} مكررة متجاهلة) — أعيد حساب ${sorted.length} يوم`
      : `لا سجلات جديدة — كل ${punches.length} سجلة على الجهاز مستوردة مسبقًا`,
  };
}

/** سحب كل الأجهزة المحلية المفعلة (السحب التلقائي) — لا يرمي أخطاء */
export async function pullAllLocalDevices(): Promise<void> {
  const devices = await db.device.findMany({ where: { enabled: true, mode: 'local', ipAddress: { not: null } }, select: { id: true, name: true } });
  for (const d of devices) {
    try { await pullDevice(d.id); } catch (e) {
      await db.device.update({ where: { id: d.id }, data: { status: 'offline' } }).catch(() => {});
      console.warn(`[auto-pull] ${d.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

export interface ImportUsersResult {
  onDevice: number; created: number; existing: number; linkedPunches: number;
  createdList: { code: string; name: string }[]; message: string;
}

/**
 * استيراد الموظفين المسجلين على جهاز البصمة: كل رقم غير موجود في النظام يُضاف موظفًا جديدًا
 * (الرقم الوظيفي = رقم الجهاز)، ثم تُربط كل بصماته السابقة. الموجودون لا يُعدَّلون.
 */
export async function importDeviceUsers(deviceId: string, userId?: string | null): Promise<ImportUsersResult> {
  const device = await db.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new DevicePullError('الجهاز غير موجود');
  if (!device.ipAddress) throw new DevicePullError('لم يُسجَّل عنوان IP للجهاز — عدّل الجهاز وأدخل IP الشبكة الخاص به');

  let users: { pin: string; name: string }[];
  try {
    if (device.vendor === 'actatek') {
      if (!device.apiUser || !device.apiPassword) throw new DevicePullError('أدخل اسم مستخدم وكلمة سر جهاز ACTAtek في بيانات الجهاز');
      users = await getActatekUsers({
        ip: device.ipAddress, port: device.port && device.port !== 4370 ? device.port : null, https: device.useHttps,
        username: device.apiUser, password: decryptSecret(device.apiPassword),
      });
    } else {
      users = await getLocalDeviceUsers({ ip: device.ipAddress, port: device.port || 4370, commKey: device.commKey || undefined });
    }
  } catch (e) {
    if (e instanceof DevicePullError) throw e;
    throw new DevicePullError(e instanceof ActatekError || e instanceof LocalDeviceError ? e.message : `تعذر قراءة الموظفين من الجهاز ${device.ipAddress}`);
  }

  const unique = new Map<string, string>();
  for (const u of users) if (u.pin && !unique.has(u.pin)) unique.set(u.pin, u.name);

  let created = 0; let existing = 0;
  const createdList: { code: string; name: string }[] = [];
  const toLink: string[] = [];
  for (const [pin, rawName] of unique) {
    const found = await db.employee.findFirst({ where: { OR: [{ pin }, { code: pin }] }, select: { id: true } });
    if (found) { existing++; toLink.push(found.id); continue; }
    const name = rawName || `موظف ${pin}`;
    const emp = await db.employee.create({ data: { code: pin, pin, name, status: 'active', basicSalary: 0, notes: `مستورد من جهاز البصمة ${device.name}` } });
    created++; toLink.push(emp.id); createdList.push({ code: pin, name });
  }
  const linkedPunches = await linkPunchesToEmployees(toLink);

  await logAudit({
    userId: userId || undefined, action: 'create', entity: 'employee', entityId: device.id,
    description: `استيراد موظفين من الجهاز ${device.name}: ${created} جديد، ${existing} موجود، ربط ${linkedPunches} بصمة`,
  });

  return {
    onDevice: unique.size, created, existing, linkedPunches, createdList,
    message: created
      ? `تمت إضافة ${created} موظف من الجهاز وربط ${linkedPunches} بصمة — أكمل بياناتهم (الراتب، القسم، تاريخ التعيين) من صفحة الموظفين`
      : `كل موظفي الجهاز (${unique.size}) موجودون في النظام — رُبطت ${linkedPunches} بصمة`,
  };
}
