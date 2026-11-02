// lib/zk/local.ts — سحب البصمات من أجهزة ZKTeco المحلية عبر الشبكة (بروتوكول ZK — منفذ 4370)
// للجهاز الذي لا يرسل ADMS Push: النظام يتصل بالجهاز مباشرة ويسحب كل السجلات المخزنة.
// يعتمد node-zklib (TCP) للاتصال النقل، مع فك سجلات 40 بايت الكامل محليًا (الحالة وطريقة التحقق).

import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
// مكتبات CJS — نستبعيها من التغليف عبر serverExternalPackages
const ZKLib = requireCjs('node-zklib') as new (ip: string, port: number, timeout: number, inport: number) => ZkLibInstance;
const { REQUEST_DATA } = requireCjs('node-zklib/constants') as { REQUEST_DATA: { GET_ATTENDANCE_LOGS: Buffer; GET_USERS: Buffer } };

interface ZkLibInstance {
  createSocket(cbErr?: (e: Error) => void, cbClose?: (t: string) => void): Promise<unknown>;
  disconnect(): Promise<void>;
  getInfo(): Promise<{ deviceName?: string; serialNumber?: string; userCounts?: number; logCapacity?: number }>;
  getSerialNumber(): Promise<{ sn?: string }>;
  zklibTcp: {
    readWithBuffer(req: Buffer, cb?: (n: number, t: number) => void): Promise<{ data: Buffer }>;
    sessionId: number | null;
    freeData(): Promise<void>;
  };
}

export interface LocalPunch {
  pin: string;
  punchTime: Date; // لحظة حقيقية — توقيت الجهاز يُعامل بتوقيت الكويت UTC+3
  status: number;
  verify: number;
}

export interface LocalDeviceInfo {
  sn?: string;
  deviceName?: string;
  userCounts?: number;
  logCapacity?: number;
  sessionId?: number;
}

export interface LocalPullResult {
  punches: LocalPunch[];
  users: { pin: string; name: string }[];
  info: LocalDeviceInfo;
  durationMs: number;
}

const KUWAIT_OFFSET_MS = 3 * 3600 * 1000; // توقيت الكويت UTC+3 — ساعة الجهاز مضبوطة عليها

/**
 * فك سجلة 40 بايت من بروتوكول ZK:
 *  0-1  تسلسل المستخدم (LE16)
 *  2-10 معرف المستخدم داخل الجهاز (9 بايت ASCII حتى null)
 *  27-30 التوقيت (LE32 — ترميز ZK: ثوانٍ في تقويم 12 شهرًا × 31 يومًا منذ 2000)
 *  31   طريقة التحقق (1 بصمة|3 كلمة سر|4 بطاقة|15 وجه)
 *  32   الحالة (0 دخول|1 خروج|2 خروج استراحة|3 عودة|4 دخول إضافي|5 خروج إضافي)
 */
function decodeRecord40(buf: Buffer): LocalPunch | null {
  if (buf.length < 40) return null;
  const pin = buf.subarray(2, 11).toString('ascii').split('\0').shift()?.trim() || '';
  if (!pin) return null;

  const packed = buf.readUInt32LE(27);
  const second = packed % 60;
  let t = (packed - second) / 60;
  const minute = t % 60;
  t = (t - minute) / 60;
  const hour = t % 24;
  t = (t - hour) / 24;
  const day = (t % 31) + 1;
  t = (t - (day - 1)) / 31;
  const month0 = t % 12;
  t = (t - month0) / 12;
  const year = t + 2000;

  // ساعة الجهاز بتوقيت الكويت — نحوّلها إلى لحظة صحيحة
  const punchTime = new Date(Date.UTC(year, month0, day, hour, minute, second) - KUWAIT_OFFSET_MS);
  if (!Number.isFinite(punchTime.getTime()) || punchTime.getFullYear() < 2000 || punchTime.getFullYear() > 2100) return null;

  const verify = buf[31] || 1;
  const status = buf[32] ?? 0;
  return { pin, punchTime, status, verify };
}

/** فك قائمة المستخدمين (سجل 72 بايت) لمطابقة pin بالاسم */
function decodeUserRecords(data: Buffer): { pin: string; name: string }[] {
  const out: { pin: string; name: string }[] = [];
  let buf = data.subarray(4); // أول 4 بايت حجم
  const REC = 72;
  while (buf.length >= REC) {
    const rec = buf.subarray(0, REC);
    const pin = rec.subarray(2, 11).toString('ascii').split('\0').shift()?.trim() || '';
    const name = rec.subarray(11, 39).toString('utf8').split('\0').shift()?.trim() || '';
    if (pin) out.push({ pin, name });
    buf = buf.subarray(REC);
  }
  return out;
}

/** فك سجلات الحضور من المخزن الخام (سجلات 40 بايت متتالية) */
function decodeAttendanceRecords(data: Buffer): LocalPunch[] {
  const out: LocalPunch[] = [];
  let buf = data.subarray(4); // أول 4 بايت حجم
  const REC = 40;
  while (buf.length >= REC) {
    const rec = decodeRecord40(buf.subarray(0, REC));
    if (rec) out.push(rec);
    buf = buf.subarray(REC);
  }
  return out;
}

export interface PullOptions {
  ip: string;
  port?: number;
  timeoutMs?: number;
  /** مفتاح الاتصال commKey — 0 افتراضيًا (إن عُدّل من قائمة الجهاز) */
  commKey?: string;
}

export class LocalDeviceError extends Error {}

/** إجبار إغلاق المقبس — المكتبة لا تُجهز مهلة SYN للعناوين غير القابلة للوصول */
function destroySocket(zk: ZkLibInstance): void {
  try {
    (zk.zklibTcp as { socket?: { destroy(): void; removeAllListeners(e: string): void } }).socket?.destroy();
  } catch { /* تجاهل */ }
}

/**
 * الاتصال بجهاز محلي وسحب كل سجلات الحضور وقائمة المستخدمين.
 * مهلة قصيرة (8 ثوانٍ افتراضيًا) مع ضابط مهلة صارم Promise.race —
 * لأن مكتبة النقل لا تُجهز محاولة TCP المعلقة لعناوين لا تستجيب.
 */
export async function pullFromLocalDevice(opts: PullOptions): Promise<LocalPullResult> {
  const started = Date.now();
  const timeout = Math.min(Math.max(opts.timeoutMs ?? 8000, 3000), 15000);
  const port = opts.port || 4370;
  const hardDeadlineMs = timeout + 4000;

  const zk = new ZKLib(opts.ip, port, timeout, 5200);

  const doPull = async (): Promise<LocalPullResult> => {
    // createSocket تتصل وتطلب CMD_CONNECT داخليًا وتستلم معرف الجلسة
    await zk.createSocket().catch((e: Error) => {
      throw new LocalDeviceError(`تعذر الوصول إلى الجهاز ${opts.ip}:${port} — تأكد أنه على نفس شبكة السيرفر وأن المنفذ 4370 مفتوح (${e.message})`);
    });

    // بيانات الجهاز + رقمه التسلسلي الفعلي
    let info: LocalDeviceInfo = {};
    try {
      const gi = await zk.getInfo();
      const gsn = await zk.getSerialNumber();
      info = { deviceName: gi.deviceName, sn: gsn.sn || gi.serialNumber, userCounts: gi.userCounts, logCapacity: gi.logCapacity, sessionId: zk.zklibTcp.sessionId || undefined };
    } catch { /* بعض الموديلات لا تدعم بعض الاستعلامات — نكمل بالسحب */ }

    // سجلات الحضور — عبر readWithBuffer لنستخرج الحالة وطريقة التحقق كاملة
    const logsRes = await zk.zklibTcp.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS).catch((e: Error) => {
      throw new LocalDeviceError(`فشل قراءة سجلات الحضور من الجهاز: ${e.message}`);
    });
    const punches = decodeAttendanceRecords(logsRes.data);

    // قائمة المستخدمين (اختياري — بعض الموديلات ترفضها)
    let users: { pin: string; name: string }[] = [];
    try {
      const usersRes = await zk.zklibTcp.readWithBuffer(REQUEST_DATA.GET_USERS);
      users = decodeUserRecords(usersRes.data);
    } catch { /* تجاهل */ }

    await zk.disconnect().catch(() => {});
    return { punches, users, info, durationMs: Date.now() - started };
  };

  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      doPull(),
      new Promise<never>((_, reject) => {
        hardTimer = setTimeout(() => {
          reject(new LocalDeviceError(`انتهت مهلة الاتصال بالجهاز ${opts.ip}:${port} (${Math.round(hardDeadlineMs / 1000)} ثانية) — تأكد أن السيرفر يصل إلى الجهاز على المنفذ وأن الجهاز غير مشغول`));
        }, hardDeadlineMs);
      }),
    ]);
    return result;
  } catch (err) {
    destroySocket(zk);
    await zk.disconnect().catch(() => {});
    throw err;
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
}
