// ترخيص النسخة المكتبية: مفتاح موقّع (Ed25519) مرتبط برقم الجهاز — يُتحقق منه بدون إنترنت
// القواعد: النسخة السحابية غير مقيدة • تجربة 30 يومًا لأي تثبيت بلا ترخيص • 7 أيام سماح بعد انتهاء الاشتراك
// • استقبال البصمات من الأجهزة لا يتوقف أبدًا • البيانات لا تُحذف أبدًا
import crypto from 'crypto';
import os from 'os';
import { execFile } from 'child_process';
import { db } from '@/lib/db';

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAabydgMA3MHlt6NRb+sLvRMKIzNnDEjl6c3ogWSWvenY=
-----END PUBLIC KEY-----`;

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;
const DAY = 86400_000;

export interface LicensePayload {
  v: 1;
  id: string; // رقم الترخيص
  customer: string; // اسم العميل
  machine: string; // رقم الجهاز
  issued: string; // YYYY-MM-DD
  expires: string | null; // YYYY-MM-DD أو null = دائم
  maxEmployees: number | null;
  maxDevices: number | null;
}

export type LicenseState = 'unrestricted' | 'licensed' | 'grace' | 'trial' | 'trial_ended' | 'expired' | 'wrong_machine';
export interface LicenseStatus {
  state: LicenseState;
  locked: boolean;
  machine: string;
  daysLeft: number | null;
  license: LicensePayload | null;
  message: string;
}

export const isDesktop = () => process.env.HRHUB_DESKTOP === '1';

// ===== رقم الجهاز: MachineGuid من الويندوز + نوع المعالج (لا يتغير بتغيير اسم الجهاز أو الذاكرة) =====
let machineCache: string | null = null;
function readMachineGuid(): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('');
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve('');
      resolve(String(out).match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/)?.[1] || '');
    });
  });
}
export async function machineCode(): Promise<string> {
  if (machineCache) return machineCache;
  const guid = await readMachineGuid();
  const cpu = os.cpus()[0]?.model?.trim() || '';
  const basis = guid ? `${guid.toLowerCase()}|${cpu}` : `${os.hostname()}|${cpu}|${os.platform()}`;
  const hex = crypto.createHash('sha256').update(basis).digest('hex').toUpperCase();
  machineCache = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  return machineCache;
}

// ===== التحقق من المفتاح =====
const b64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export function verifyLicenseKey(key: string): LicensePayload | null {
  try {
    const clean = key.replace(/\s+/g, '').replace(/^HRHUB-/, '');
    const [data, sig] = clean.split('.');
    if (!data || !sig) return null;
    const ok = crypto.verify(null, Buffer.from(data), crypto.createPublicKey(PUBLIC_KEY), b64u(sig));
    if (!ok) return null;
    const p = JSON.parse(b64u(data).toString('utf8')) as LicensePayload;
    return p && p.v === 1 && p.machine ? p : null;
  } catch {
    return null;
  }
}

// ===== التخزين (جدول الإعدادات) =====
const K = { key: 'license.key', first: 'license.firstRun', seen: 'license.maxSeen' };
async function getSetting(key: string) { return (await db.setting.findUnique({ where: { key } }))?.value || null; }
async function setSetting(key: string, value: string) { await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } }); }

/** الوقت المعتمد = الأحدث بين ساعة الجهاز وأعلى وقت شوهد (يمنع إرجاع الساعة للخلف) */
async function trustedNow(): Promise<number> {
  const now = Date.now();
  const seen = Number(await getSetting(K.seen)) || 0;
  if (now > seen + 3600_000) await setSetting(K.seen, String(now)).catch(() => {});
  return Math.max(now, seen);
}

let cache: { at: number; status: LicenseStatus } | null = null;
export function clearLicenseCache() { cache = null; }

export async function licenseStatus(): Promise<LicenseStatus> {
  const machine = await machineCode();
  if (!isDesktop()) return { state: 'unrestricted', locked: false, machine, daysLeft: null, license: null, message: '' };
  if (cache && Date.now() - cache.at < 60_000) return cache.status;

  const now = await trustedNow();
  let first = await getSetting(K.first);
  if (!first) { first = new Date(now).toISOString(); await setSetting(K.first, first); }
  const key = await getSetting(K.key);
  const lic = key ? verifyLicenseKey(key) : null;
  let status: LicenseStatus;

  if (lic && lic.machine === machine) {
    if (!lic.expires) {
      status = { state: 'licensed', locked: false, machine, daysLeft: null, license: lic, message: `مرخص لـ ${lic.customer}` };
    } else {
      const end = new Date(`${lic.expires}T23:59:59+03:00`).getTime();
      const left = Math.ceil((end - now) / DAY);
      if (left >= 0) status = { state: 'licensed', locked: false, machine, daysLeft: left, license: lic, message: `مرخص لـ ${lic.customer} حتى ${lic.expires}` };
      else if (left >= -GRACE_DAYS) status = { state: 'grace', locked: false, machine, daysLeft: GRACE_DAYS + left, license: lic, message: `انتهى الترخيص في ${lic.expires} — فترة سماح` };
      else status = { state: 'expired', locked: true, machine, daysLeft: 0, license: lic, message: `انتهى الترخيص في ${lic.expires} — جدّد الترخيص لمتابعة العمل` };
    }
  } else {
    const left = Math.ceil((new Date(first).getTime() + TRIAL_DAYS * DAY - now) / DAY);
    const wrong = !!(lic && lic.machine !== machine);
    if (left > 0) status = { state: wrong ? 'wrong_machine' : 'trial', locked: false, machine, daysLeft: left, license: null, message: wrong ? 'الترخيص المسجل لجهاز آخر — فترة تجربة' : 'نسخة تجريبية' };
    else status = { state: wrong ? 'wrong_machine' : 'trial_ended', locked: true, machine, daysLeft: 0, license: null, message: wrong ? 'الترخيص المسجل لجهاز آخر — فعّل البرنامج بمفتاح لهذا الجهاز' : 'انتهت الفترة التجريبية — فعّل البرنامج لمتابعة العمل' };
  }
  cache = { at: Date.now(), status };
  return status;
}

/** تفعيل بمفتاح جديد — يرجع رسالة خطأ أو null */
export async function activateLicense(key: string): Promise<string | null> {
  const lic = verifyLicenseKey(key);
  if (!lic) return 'مفتاح الترخيص غير صحيح — تأكد من نسخه كاملًا';
  if (lic.machine !== await machineCode()) return 'هذا المفتاح لجهاز آخر — أرسل رقم هذا الجهاز للحصول على مفتاح خاص به';
  if (lic.expires && new Date(`${lic.expires}T23:59:59+03:00`).getTime() < Date.now()) return `هذا المفتاح منتهي منذ ${lic.expires}`;
  await setSetting(K.key, key.replace(/\s+/g, ''));
  clearLicenseCache();
  return null;
}

/** حدود الترخيص (عدد الموظفين/الأجهزة) — null = بلا حد */
export async function licenseLimit(kind: 'employees' | 'devices'): Promise<number | null> {
  const st = await licenseStatus();
  if (!st.license) return null;
  return kind === 'employees' ? st.license.maxEmployees ?? null : st.license.maxDevices ?? null;
}
