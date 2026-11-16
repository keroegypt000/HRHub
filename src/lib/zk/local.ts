// lib/zk/local.ts — سحب البصمات من أجهزة ZKTeco المحلية عبر الشبكة (بروتوكول ZK — منفذ 4370)
// للجهاز الذي لا يرسل ADMS Push: النظام يتصل بالجهاز مباشرة ويسحب كل السجلات المخزنة.
// يعتمد node-zklib (TCP) للاتصال النقل، مع فك سجلات 40 بايت الكامل محليًا (الحالة وطريقة التحقق).

import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
// مكتبات CJS — نستبعيها من التغليف عبر serverExternalPackages
const ZKLib = requireCjs('node-zklib') as new (ip: string, port: number, timeout: number, inport: number) => ZkLibInstance;
const { REQUEST_DATA } = requireCjs('node-zklib/constants') as { REQUEST_DATA: { GET_ATTENDANCE_LOGS: Buffer; GET_USERS: Buffer } };

interface ZkTransport {
  readWithBuffer(req: Buffer, cb?: (n: number, t: number) => void): Promise<{ data: Buffer | null; mode?: number; err?: unknown }>;
  sessionId: number | null;
  freeData(): Promise<void>;
}

interface ZkLibInstance {
  createSocket(cbErr?: (e: Error) => void, cbClose?: (t: string) => void): Promise<unknown>;
  disconnect(): Promise<void>;
  getInfo(): Promise<{ deviceName?: string; serialNumber?: string; userCounts?: number; logCounts?: number; logCapacity?: number }>;
  getSerialNumber(): Promise<{ sn?: string }>;
  /** tcp للأجهزة الحديثة — udp للموديلات الأقدم (المنفذ 4370 يرفض TCP) */
  connectionType: 'tcp' | 'udp' | null;
  zklibTcp: ZkTransport;
  zklibUdp: ZkTransport;
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
/** ترميز وقت ZK (ثوانٍ في تقويم 12×31 منذ 2000، بتوقيت الجهاز) → لحظة */
export function decodeZkTime(packed: number): Date | null {
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
  return punchTime;
}

function decodeRecord40(buf: Buffer): LocalPunch | null {
  if (buf.length < 40) return null;
  const pin = buf.subarray(2, 11).toString('ascii').split('\0').shift()?.trim() || '';
  if (!pin) return null;
  const punchTime = decodeZkTime(buf.readUInt32LE(27));
  if (!punchTime) return null;
  const verify = buf[31] || 1;
  const status = buf[32] ?? 0;
  return { pin, punchTime, status, verify };
}

/**
 * سجلة 16 بايت (موديلات UDP الأقدم): user_id(4) + الوقت(4) + التحقق(1) + الحالة(1) + محجوز(2) + workcode(4)
 */
function decodeRecord16(buf: Buffer): LocalPunch | null {
  const id = buf.readUInt32LE(0);
  const punchTime = decodeZkTime(buf.readUInt32LE(4));
  if (!id || !punchTime) return null;
  return { pin: String(id), punchTime, verify: buf[8] || 1, status: buf[9] ?? 0 };
}

/** سجلة 8 بايت (أقدم الموديلات): uid داخلي(2) + الحالة(1) + الوقت(4) + punch(1) — الـ uid يُترجم من قائمة المستخدمين */
function decodeRecord8(buf: Buffer, uidToPin: Map<number, string>): LocalPunch | null {
  const uid = buf.readUInt16LE(0);
  const punchTime = decodeZkTime(buf.readUInt32LE(3));
  if (!punchTime) return null;
  return { pin: uidToPin.get(uid) || String(uid), punchTime, verify: 1, status: buf[7] ?? 0 };
}

/** حجم السجلة: من عدد السجلات المعلن إن وُجد، وإلا بالقسمة */
function recordSize(total: number, count: number | undefined, sizes: number[]): number {
  if (count && total % count === 0 && sizes.includes(total / count)) return total / count;
  return sizes.find((n) => total % n === 0) || sizes[0];
}

/** فك قائمة المستخدمين (72 بايت للحديث، 28 بايت للقديم) */
export function decodeUserRecords(data: Buffer, count?: number): { pin: string; name: string; uid: number }[] {
  const out: { pin: string; name: string; uid: number }[] = [];
  let buf = data.subarray(4); // أول 4 بايت حجم
  const REC = recordSize(buf.length, count, [72, 28]);
  while (buf.length >= REC) {
    const rec = buf.subarray(0, REC);
    const uid = rec.readUInt16LE(0);
    let pin = ''; let name = '';
    if (REC === 28) {
      name = rec.subarray(8, 16).toString('utf8').split('\0').shift()?.trim() || '';
      pin = String(rec.readUInt32LE(24));
    } else {
      pin = rec.subarray(48, 72).toString('ascii').split('\0').shift()?.trim() || rec.subarray(2, 11).toString('ascii').split('\0').shift()?.trim() || '';
      name = rec.subarray(11, 35).toString('utf8').split('\0').shift()?.trim() || '';
    }
    if (pin && pin !== '0') out.push({ pin, name, uid });
    buf = buf.subarray(REC);
  }
  return out;
}

/** فك سجلات الحضور (40 بايت للحديث، 16 أو 8 بايت للموديلات الأقدم) */
export function decodeAttendanceRecords(data: Buffer, count?: number, uidToPin: Map<number, string> = new Map()): LocalPunch[] {
  const out: LocalPunch[] = [];
  let buf = data.subarray(4); // أول 4 بايت حجم
  const REC = recordSize(buf.length, count, [40, 16, 8]);
  while (buf.length >= REC) {
    const chunk = buf.subarray(0, REC);
    const rec = REC === 40 ? decodeRecord40(chunk) : REC === 16 ? decodeRecord16(chunk) : decodeRecord8(chunk, uidToPin);
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

/**
 * جلسة واحدة لكل جهاز في نفس الوقت + مهلة قصيرة بين الجلسات:
 * أجهزة UDP القديمة ترد بلا بيانات لو فُتحت جلسة جديدة فور إغلاق السابقة (السحب التلقائي + زر يدوي مثلًا)
 */
const deviceQueue = new Map<string, Promise<unknown>>();
const lastSession = new Map<string, number>();
const SESSION_GAP_MS = 2500;
async function withDevice<T>(ip: string, fn: () => Promise<T>): Promise<T> {
  const prev = deviceQueue.get(ip) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const wait = (lastSession.get(ip) || 0) + SESSION_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } catch (e) {
      // محاولة ثانية واحدة بعد مهلة — الجهاز كان مشغولًا غالبًا
      await new Promise((r) => setTimeout(r, SESSION_GAP_MS));
      try { return await fn(); } catch { throw e; }
    } finally {
      lastSession.set(ip, Date.now());
    }
  });
  deviceQueue.set(ip, run);
  try { return await run; } finally { if (deviceQueue.get(ip) === run) deviceQueue.delete(ip); }
}

/** إجبار إغلاق المقبس — المكتبة لا تُجهز مهلة SYN للعناوين غير القابلة للوصول */
function destroySocket(zk: ZkLibInstance): void {
  try {
    // TCP فقط: إغلاق UDP مرتين يُسقط مكتبة node-zklib (closeSocket تستدعي timer قبل تعريفه)
    if (zk.connectionType !== 'udp') (zk.zklibTcp as unknown as { socket?: { destroy(): void } }).socket?.destroy();
  } catch { /* تجاهل */ }
}

/**
 * الاتصال بجهاز محلي وسحب كل سجلات الحضور وقائمة المستخدمين.
 * مهلة قصيرة (8 ثوانٍ افتراضيًا) مع ضابط مهلة صارم Promise.race —
 * لأن مكتبة النقل لا تُجهز محاولة TCP المعلقة لعناوين لا تستجيب.
 */
export async function pullFromLocalDevice(opts: PullOptions): Promise<LocalPullResult> {
  return withDevice(opts.ip, () => pullOnce(opts));
}

async function pullOnce(opts: PullOptions): Promise<LocalPullResult> {
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

    // الجهاز الحديث يتصل TCP، والأقدم UDP — نفس الأوامر على الناقل المتاح
    const t = zk.connectionType === 'udp' ? zk.zklibUdp : zk.zklibTcp;

    // بيانات الجهاز + رقمه التسلسلي الفعلي
    let info: LocalDeviceInfo = {};
    let logCounts: number | undefined;
    try {
      const gi = await zk.getInfo();
      logCounts = gi.logCounts;
      info = { deviceName: gi.deviceName, sn: gi.serialNumber, userCounts: gi.userCounts, logCapacity: gi.logCapacity, sessionId: t.sessionId || undefined };
      const gsn = await zk.getSerialNumber().catch(() => ({ sn: undefined }));
      if (gsn.sn) info.sn = gsn.sn;
    } catch { /* بعض الموديلات لا تدعم بعض الاستعلامات — نكمل بالسحب */ }

    // قائمة المستخدمين أولًا (السجلات القديمة 8 بايت تحتاجها لترجمة الرقم الداخلي)
    let users: { pin: string; name: string; uid: number }[] = [];
    try {
      await t.freeData().catch(() => {});
      const usersRes = await t.readWithBuffer(REQUEST_DATA.GET_USERS);
      if (usersRes.data) users = decodeUserRecords(usersRes.data, info.userCounts);
    } catch { /* تجاهل */ }

    // سجلات الحضور — عبر readWithBuffer لنستخرج الحالة وطريقة التحقق كاملة
    await t.freeData().catch(() => {});
    const logsRes = await t.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS).catch((e: Error) => {
      throw new LocalDeviceError(`فشل قراءة سجلات الحضور من الجهاز: ${e.message}`);
    });
    if (!logsRes.data) throw new LocalDeviceError('الجهاز لم يرسل سجلات الحضور — أعد المحاولة بعد دقيقة (قد يكون مشغولًا)');
    const punches = decodeAttendanceRecords(logsRes.data, logCounts, new Map(users.map((u) => [u.uid, u.pin])));
    await t.freeData().catch(() => {});

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

/** قراءة قائمة المستخدمين فقط من جهاز ZKTeco (لاستيراد الموظفين) — بدون سحب السجلات */
export async function getLocalDeviceUsers(opts: PullOptions): Promise<{ pin: string; name: string }[]> {
  return withDevice(opts.ip, () => usersOnce(opts));
}

async function usersOnce(opts: PullOptions): Promise<{ pin: string; name: string }[]> {
  const port = opts.port || 4370;
  const zk = new ZKLib(opts.ip, port, Math.min(Math.max(opts.timeoutMs ?? 8000, 3000), 15000), 5200);
  const work = async () => {
    await zk.createSocket().catch((e: Error) => {
      throw new LocalDeviceError(`تعذر الوصول إلى الجهاز ${opts.ip}:${port} (${e.message})`);
    });
    const t = zk.connectionType === 'udp' ? zk.zklibUdp : zk.zklibTcp;
    const info = await zk.getInfo().catch(() => ({ userCounts: undefined }));
    await t.freeData().catch(() => {});
    const res = await t.readWithBuffer(REQUEST_DATA.GET_USERS);
    await t.freeData().catch(() => {});
    if (!res.data) throw new LocalDeviceError('الجهاز لم يرسل قائمة المستخدمين — أعد المحاولة بعد دقيقة');
    return decodeUserRecords(res.data, info.userCounts).map(({ pin, name }) => ({ pin, name }));
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([work(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new LocalDeviceError(`انتهت مهلة الاتصال بالجهاز ${opts.ip}`)), 20000); })]);
  } catch (err) {
    destroySocket(zk);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    await zk.disconnect().catch(() => {});
  }
}
