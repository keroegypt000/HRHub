// lib/settings.ts — إعدادات النظام key/value مع قيم افتراضية معلنة
import { db } from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface SystemSettings {
  companyName: string;
  companyLogoFileId: string | null;
  workDaysPerMonth: number;
  hoursPerDay: number;
  otWeekdayMult: number;
  otHolidayMult: number;
  lateDeductionMode: 'minute' | 'none';
  socialSecurityEnabled: boolean;
  sscEmployeeCitizen: number; // 5.5%
  sscEmployerCitizen: number; // 11.5%
  sscEmployerExpatriate: number; // 2.5%
  defaultShiftId: string | null;
  autoAcceptDevices: boolean;
  admsEnabled: boolean;
  biotimeEnabled: boolean;
  biotimeUrl: string;
  biotimeUsername: string;
  biotimePasswordEnc: string | null; // مشفرة ولا تعود للواجهة إلا مخفية
  biotimeAutoSyncMinutes: number; // 0 = معطلة
  deviceOfflineAlertMinutes: number; // 10
  vacationAnnualQuota: number; // حصة الإجازة السنوية المتراكمة (30 يوم افتراضيًا)
  eosResignTiers: string; // JSON نسب فترة الخدمة للاستقالة
  eosBasisDefault: string; // أساس مكافأة نهاية الخدمة الافتراضي: basic|full_wage
}

export const DEFAULT_SETTINGS: SystemSettings = {
  companyName: 'شركة ADMS',
  companyLogoFileId: null,
  workDaysPerMonth: 26,
  hoursPerDay: 8,
  otWeekdayMult: 1.25,
  otHolidayMult: 1.5,
  lateDeductionMode: 'minute',
  socialSecurityEnabled: false,
  sscEmployeeCitizen: 5.5,
  sscEmployerCitizen: 11.5,
  sscEmployerExpatriate: 2.5,
  defaultShiftId: null,
  autoAcceptDevices: true,
  admsEnabled: true,
  biotimeEnabled: false,
  biotimeUrl: '',
  biotimeUsername: '',
  biotimePasswordEnc: null,
  biotimeAutoSyncMinutes: 0,
  deviceOfflineAlertMinutes: 10,
  vacationAnnualQuota: 30,
  eosResignTiers: '',
  eosBasisDefault: 'basic',
};

/** مفتاح تشفير ثابت للجلسة — يُولَّد مرة ويُحفظ بجانب قاعدة البيانات */
function cryptoKey(): Buffer {
  const dir = path.dirname(process.env.DATABASE_URL?.replace('file:', '') || './db/custom.db');
  const keyFile = path.join(dir, '.secret.key');
  try {
    if (fs.existsSync(keyFile)) return Buffer.from(fs.readFileSync(keyFile, 'utf8'), 'hex');
  } catch {}
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  } catch {}
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cryptoKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// كاش قصير في الذاكرة — كل استعلام من قاعدة Prisma Postgres يُحتسب عملية،
// وgetSettings كانت تُستدعى مع كل طلب ADMS (كل 30 ثانية لكل جهاز) فتستهلك الحصة المجانية
let settingsCache: { value: SystemSettings; at: number } | null = null;
const SETTINGS_TTL_MS = 60_000;

export async function getSettings(): Promise<SystemSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const rows = await db.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const s: SystemSettings = { ...DEFAULT_SETTINGS };
  const bool = (k: keyof SystemSettings) => map.get(k) === 'true';
  const numv = (k: keyof SystemSettings, d: number) => {
    const v = parseFloat(map.get(k) || '');
    return Number.isFinite(v) ? v : d;
  };
  s.companyName = map.get('companyName') || s.companyName;
  s.companyLogoFileId = map.get('companyLogoFileId') || null;
  s.workDaysPerMonth = numv('workDaysPerMonth', 26);
  s.hoursPerDay = numv('hoursPerDay', 8);
  s.otWeekdayMult = numv('otWeekdayMult', 1.25);
  s.otHolidayMult = numv('otHolidayMult', 1.5);
  s.lateDeductionMode = (map.get('lateDeductionMode') as SystemSettings['lateDeductionMode']) || 'minute';
  s.socialSecurityEnabled = bool('socialSecurityEnabled');
  s.sscEmployeeCitizen = numv('sscEmployeeCitizen', 5.5);
  s.sscEmployerCitizen = numv('sscEmployerCitizen', 11.5);
  s.sscEmployerExpatriate = numv('sscEmployerExpatriate', 2.5);
  s.defaultShiftId = map.get('defaultShiftId') || null;
  s.autoAcceptDevices = map.get('autoAcceptDevices') !== 'false';
  s.admsEnabled = map.get('admsEnabled') !== 'false';
  s.biotimeEnabled = bool('biotimeEnabled');
  s.biotimeUrl = map.get('biotimeUrl') || '';
  s.biotimeUsername = map.get('biotimeUsername') || '';
  s.biotimePasswordEnc = map.get('biotimePasswordEnc') || null;
  s.biotimeAutoSyncMinutes = numv('biotimeAutoSyncMinutes', 0);
  s.deviceOfflineAlertMinutes = numv('deviceOfflineAlertMinutes', 10);
  s.vacationAnnualQuota = numv('vacationAnnualQuota', 30);
  s.eosResignTiers = map.get('eosResignTiers') || '';
  s.eosBasisDefault = map.get('eosBasisDefault') === 'full_wage' ? 'full_wage' : 'basic';
  settingsCache = { value: s, at: Date.now() };
  return s;
}

export async function saveSettings(updates: Record<string, string | boolean | number | null>): Promise<void> {
  const ops = Object.entries(updates).filter(([key]) => key !== 'biotimePassword' || !!key);
  for (const [key, value] of ops) {
    if (value === undefined) continue;
    await db.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  settingsCache = null; // إبطال الكاش فورًا بعد الحفظ
}
