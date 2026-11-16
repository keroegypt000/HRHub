// lib/actatek.ts — سحب الحركات وصورها من أجهزة ACTAtek عبر الشبكة المحلية
// 1) REST API (فيرموير ACTAtek4 الحديث): /cgi-bin/restapi/login ثم getLogs/{session}/{limit} بالتفاصيل والصورة
// 2) SOAP (الفيرموير الأقدم): /cgi-bin/rpcrouter — login ثم getFullLogs (نفس البيانات)
// المرجع: ACTAtek REST API Manual v0.1 (2025) + ACTAtek SOAP API Manual v1.23
import http from 'http';
import https from 'https';
import { parseDeviceTime } from '@/lib/zk/protocol';

export interface ActatekConfig {
  ip: string;
  port?: number | null;
  https?: boolean;
  username: string;
  password: string;
  timeoutMs?: number;
}

export interface ActatekPunch {
  pin: string;
  punchTime: Date;
  status: number; // 0 دخول | 1 خروج
  trigger: string;
  terminalSN?: string;
  terminalName?: string;
  userName?: string;
  photo?: Buffer;
  accessMethod?: string;
}

export class ActatekError extends Error {}

interface HttpRes { status: number; body: string }

/** طلب HTTP/HTTPS بسيط بلا مكتبات — يقبل شهادة الجهاز الذاتية (شبكة داخلية) */
function request(cfg: ActatekConfig, method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<HttpRes> {
  const mod = cfg.https ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      host: cfg.ip, port: cfg.port || (cfg.https ? 443 : 80), method, path,
      headers: { ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}), ...headers },
      timeout: cfg.timeoutMs || 15000,
      ...(cfg.https ? { rejectUnauthorized: false } : {}),
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new ActatekError(`انتهت مهلة الاتصال بجهاز ACTAtek ${cfg.ip}`)));
    req.on('error', (e) => reject(e instanceof ActatekError ? e : new ActatekError(`تعذر الاتصال بجهاز ACTAtek ${cfg.ip}: ${e.message}`)));
    if (body) req.write(body);
    req.end();
  });
}

/** وقت محلي بلا Z (توقيت الجهاز) أو UTC بـ Z → لحظة */
export function parseActaTime(s: string): Date | null {
  const t = (s || '').trim();
  if (!t) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return parseDeviceTime(t);
}

/** حدث ACTAtek → حالة البصمة (null = ليس حضورًا: مرفوض/دخول إداري...) */
export function triggerToStatus(trigger: string): number | null {
  const t = (trigger || '').trim().toUpperCase();
  if (t === 'IN') return 0;
  if (t === 'OUT') return 1;
  if (/^F\d+$/.test(t)) return 0; // مفاتيح الوظائف F1..F40 تُعامل حركة حضور (الحساب يزاوج الدخول/الخروج)
  return null;
}

/** "YYYY-MM-DDTHH:MM:SS" بتوقيت الكويت (بلا Z) */
function localStamp(d: Date): string {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 19);
}

function decodePhoto(b64?: string): Buffer | undefined {
  if (!b64 || b64.length < 100) return undefined;
  const buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
  return buf[0] === 0xff && buf[1] === 0xd8 ? buf : undefined;
}

// ===================== REST =====================

async function restLogin(cfg: ActatekConfig): Promise<string | null> {
  const res = await request(cfg, 'POST', '/cgi-bin/restapi/login', JSON.stringify({ username: cfg.username, password: cfg.password }), { 'Content-Type': 'application/json' });
  if (res.status === 404) return null; // فيرموير بلا REST → نجرب SOAP
  let data: { status?: string; sessionid?: string | number; message?: string } = {};
  try { data = JSON.parse(res.body); } catch { return null; }
  if (data.status !== 'success' || !data.sessionid) {
    throw new ActatekError(`رفض جهاز ACTAtek تسجيل الدخول: ${data.message || 'اسم المستخدم أو كلمة السر غير صحيحة'}`);
  }
  return String(data.sessionid);
}

interface RestLog {
  logID?: number; userID?: string; userName?: string; timestamp?: string; trigger?: string;
  terminalSN?: string; terminalName?: string; jpegPhoto?: string; accessMethod?: string;
}

function mapLog(l: RestLog): ActatekPunch | null {
  const status = triggerToStatus(l.trigger || '');
  const punchTime = parseActaTime(l.timestamp || '');
  const pin = (l.userID || '').trim();
  if (status === null || !punchTime || !pin) return null;
  return {
    pin, punchTime, status, trigger: l.trigger || '', terminalSN: l.terminalSN, terminalName: l.terminalName,
    userName: l.userName, accessMethod: l.accessMethod, photo: decodePhoto(l.jpegPhoto),
  };
}

async function restPull(cfg: ActatekConfig, sid: string, from: Date, to: Date): Promise<ActatekPunch[]> {
  const q = `from=${encodeURIComponent(localStamp(from))}&to=${encodeURIComponent(localStamp(to))}`;
  // getFullLogs = نفس المسار getLogs مع {limit} — يرجع الاسم والصورة
  const res = await request(cfg, 'GET', `/cgi-bin/restapi/getLogs/${sid}/100000?${q}`);
  if (res.status >= 400) throw new ActatekError(`خطأ من جهاز ACTAtek (${res.status}) أثناء سحب الحركات`);
  let rows: RestLog[] = [];
  try { const j = JSON.parse(res.body); rows = Array.isArray(j) ? j : j ? [j] : []; } catch { rows = []; }
  return rows.map(mapLog).filter((x): x is ActatekPunch => !!x);
}

// ===================== SOAP =====================

const SOAP_NS = 'http://www.hectrix.com/ACTAtek.xsd';
const envelope = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:ns="${SOAP_NS}">
<SOAP-ENV:Body>${inner}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1]?.trim();

async function soap(cfg: ActatekConfig, inner: string): Promise<string> {
  const res = await request(cfg, 'POST', '/cgi-bin/rpcrouter', envelope(inner), { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' });
  if (res.status === 404) throw new ActatekError(`جهاز ${cfg.ip} لا يدعم REST ولا SOAP — تأكد أنه جهاز ACTAtek وأن IP صحيح`);
  const fault = tag(res.body, 'faultstring');
  if (fault) throw new ActatekError(`خطأ من جهاز ACTAtek: ${fault}`);
  return res.body;
}

/** تفكيك رد getFullLogs: كل سجلة تبدأ بـ <logID> */
export function parseSoapLogs(xml: string): ActatekPunch[] {
  const out: ActatekPunch[] = [];
  const parts = xml.split(/<(?:\w+:)?logID[^>]*>/).slice(1);
  for (const p of parts) {
    const log: RestLog = {
      userID: tag(p, 'userID'), userName: tag(p, 'userName'), timestamp: tag(p, 'timestamp'),
      trigger: tag(p, 'trigger'), terminalSN: tag(p, 'terminalSN'), terminalName: tag(p, 'terminalName'),
      jpegPhoto: tag(p, 'jpegPhoto'),
    };
    const m = mapLog(log);
    if (m) out.push(m);
  }
  return out;
}

async function soapPull(cfg: ActatekConfig, from: Date, to: Date): Promise<ActatekPunch[]> {
  const loginXml = await soap(cfg, `<ns:login><username>${xmlEsc(cfg.username)}</username><password>${xmlEsc(cfg.password)}</password></ns:login>`);
  const sid = tag(loginXml, 'sessionID') || tag(loginXml, 'return');
  if (!sid || !/^\d+$/.test(sid)) throw new ActatekError('رفض جهاز ACTAtek تسجيل الدخول — راجع اسم المستخدم وكلمة السر');
  try {
    const xml = await soap(cfg, `<ns:getFullLogs><sessionID>${sid}</sessionID><getLogsCriteria>
<from>${localStamp(from)}</from><to>${localStamp(to)}</to><employeeName></employeeName><employeeID></employeeID>
<departmentID>0</departmentID><trigger>UNKNOWN</trigger><terminalSN></terminalSN></getLogsCriteria><limit>0</limit></ns:getFullLogs>`);
    return parseSoapLogs(xml);
  } finally {
    await soap(cfg, `<ns:logout><sessionID>${sid}</sessionID></ns:logout>`).catch(() => {});
  }
}

/** سحب حركات الفترة (أسبوع بأسبوع لتخفيف حجم الصور في كل طلب) */
export async function pullFromActatek(cfg: ActatekConfig, from: Date, to: Date): Promise<{ punches: ActatekPunch[]; api: 'rest' | 'soap' }> {
  const windows: [Date, Date][] = [];
  for (let s = from.getTime(); s < to.getTime(); s += 7 * 86400_000) windows.push([new Date(s), new Date(Math.min(s + 7 * 86400_000, to.getTime()))]);
  if (!windows.length) windows.push([from, to]);

  const sid = await restLogin(cfg);
  const punches: ActatekPunch[] = [];
  if (sid) {
    try {
      for (const [a, b] of windows) punches.push(...await restPull(cfg, sid, a, b));
    } finally {
      await request(cfg, 'DELETE', `/cgi-bin/restapi/logout/${sid}`).catch(() => {});
    }
    return { punches, api: 'rest' };
  }
  for (const [a, b] of windows) punches.push(...await soapPull(cfg, a, b));
  return { punches, api: 'soap' };
}
