// lib/zk/protocol.ts — فك بروتوكول ADMS Push من أجهزة ZKTeco
// Handshake / Keep-alive / ATTLOG (CSV أو Hex) / USERINFO — وفق توثيق ZK Push Protocol

export interface ParsedHandshake {
  sn: string;
  pushVersion?: string;
  options?: string;
}

/** تحليل معاملات طلب الـ handshake */
export function parseHandshake(params: URLSearchParams): ParsedHandshake | null {
  const sn = params.get('SN');
  if (!sn) return null;
  return {
    sn: sn.trim(),
    pushVersion: params.get('pushver') || params.get('push_version') || undefined,
    options: params.get('options') || undefined,
  };
}

/**
 * رد الـ handshake: سلسلة إعدادات قصيرة — الجهاز يقرأ أول سطر OK ثم الإعدادات.
 * VERIFY=1 (بصمة)، INFORM=0 (لا تنبيه شاشة)، مع دفع فوري للسجلات.
 */
export function handshakeResponse(serverTime: Date): string {
  const t = serverTime.toISOString().replace('T', ' ').slice(0, 19);
  return [
    'OK',
    `VERIFY=1`,
    `INFORM=0`,
    `ATTLOGInterval=0`,
    `RealTime=1`,
    `ServerVer=2.4.0`,
    `~Date=${t}`,
  ].join('\n');
}

/** رد keep-alive مع أوامر عكسية اختيارية */
export function keepAliveResponse(commands: string[] = []): string {
  if (!commands.length) return 'OK';
  return `OK\n${commands.join('\n')}`;
}

export interface RawPunch {
  pin: string;
  punchTime: Date; // بتوقيت الجهاز (الكويت) — يُحوَّل إلى لحظة
  status: number; // 0 دخول|1 خروج|2 استراحة|3 عودة|4 دخول إضافي|5 خروج إضافي
  verify: number; // 1 بصمة|3 كلمة سر|4 بطاقة|15 وجه
  workCode?: string;
}

/** محاولة فك سطر Hex (تشفير بعض الأجهزة) */
function tryHexDecode(line: string): string | null {
  if (!/^[0-9a-fA-F]{20,}$/.test(line.trim())) return null;
  try {
    const decoded = Buffer.from(line.trim(), 'hex').toString('utf8');
    if (/[\t,]/.test(decoded)) return decoded;
    return null;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD HH:MM:SS" بتوقيت الجهاز (الكويت UTC+3) → لحظة */
export function parseDeviceTime(s: string): Date | null {
  const clean = s.trim().replace('T', ' ');
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${(sec || '0').padStart(2, '0')}.000+03:00`;
  const dt = new Date(iso);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/**
 * تحليل جسم ATTLOG: كل سطر سجلة بالفواصل الجدوبة أو الفواصل:
 * pin \t punchTime \t status \t verify \t workCode
 * يدعم التشفير Hex تلقائيًا.
 */
export function parseATTLOG(body: string): RawPunch[] {
  const out: RawPunch[] = [];
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let content = line;
    const decoded = tryHexDecode(line);
    if (decoded) content = decoded;
    const parts = content.split(/[\t,]+/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const pin = parts[0];
    const timeStr = parts[1];
    if (!pin || !timeStr) continue;
    const punchTime = parseDeviceTime(timeStr);
    if (!punchTime) continue;
    const status = parseInt(parts[2] || '0', 10) || 0;
    const verify = parseInt(parts[3] || '1', 10) || 1;
    const workCode = parts[4] || undefined;
    out.push({ pin, punchTime, status, verify, workCode });
  }
  return out;
}

export interface RawUserInfo {
  pin: string;
  name: string;
  privilege?: number;
  password?: string;
  card?: string;
}

/** تحليل جسم USERINFO: pin \t name \t privilege \t password \t card ... */
export function parseUSERINFO(body: string): RawUserInfo[] {
  const out: RawUserInfo[] = [];
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let content = line;
    const decoded = tryHexDecode(line);
    if (decoded) content = decoded;
    const parts = content.split(/[\t]+/).map((p) => p.trim());
    if (parts.length < 2 || !parts[0]) continue;
    out.push({ pin: parts[0], name: parts[1], privilege: parseInt(parts[2] || '0', 10), card: parts[4] });
  }
  return out;
}

/** أوامر عكسية لجلب البيانات من الجهاز */
export const DEVICE_COMMANDS = {
  /** إجبار الجهاز على رفع كل السجلات */
  fetchAllLogs: 'CHECKIN',
  /** رفع قائمة المستخدمين */
  fetchUsers: 'UPLOADUSERINFO',
  /** طلب بيانات الجهاز */
  fetchDeviceInfo: 'OPTIONS',
} as const;

export const STATUS_AR: Record<number, string> = {
  0: 'دخول',
  1: 'خروج',
  2: 'خروج لاستراحة',
  3: 'عودة من الاستراحة',
  4: 'دخول عمل إضافي',
  5: 'خروج من عمل إضافي',
};

export const VERIFY_AR: Record<number, string> = {
  0: 'غير محدد',
  1: 'بصمة',
  3: 'كلمة سر',
  4: 'بطاقة',
  15: 'وجه',
};
