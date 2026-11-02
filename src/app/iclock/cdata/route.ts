// /iclock/cdata — نقطة ADMS الموحدة: handshake (GET options=all)، keep-alive (GET)،
// ATTLOG (POST)، USERINFO/FP (POST). بلا مصادقة مستخدم بطبيعة البروتوكول،
// مع تحقق SN وrate limit بسيط لمنع الإغراق.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  parseHandshake, handshakeResponse, keepAliveResponse,
  parseATTLOG, parseUSERINFO, DEVICE_COMMANDS,
} from '@/lib/zk/protocol';
import { getSettings } from '@/lib/settings';
import { resolveEmployeeByPin, recomputeDayForEmployees } from '@/lib/attendance';
import { dateKey } from '@/lib/time';
import { logAudit } from '@/lib/audit';

// rate limit بسيط لكل SN على مسار ADMS (منع الإغراق)
const admsHits = new Map<string, { count: number; windowStart: number }>();
function admsRateLimited(sn: string): boolean {
  const now = Date.now();
  const rec = admsHits.get(sn);
  if (!rec || now - rec.windowStart > 60_000) {
    admsHits.set(sn, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > 600; // 600 طلب/دقيقة لكل جهاز — أقصى من أي جهاز حقيقي بكثير
}

async function touchDevice(sn: string, ip: string, pushVersion?: string): Promise<boolean> {
  const device = await db.device.findUnique({ where: { sn } });
  if (!device) return false;
  await db.device.update({
    where: { sn },
    data: { lastSeenAt: new Date(), lastIp: ip, status: 'online', pushVersion: pushVersion || device.pushVersion },
  });
  return true;
}

async function getPendingCommand(sn: string): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: `devicecmd:${sn}` } });
  if (!row?.value) return [];
  await db.setting.delete({ where: { key: `devicecmd:${sn}` } }).catch(() => {});
  return [row.value];
}

async function upsertDeviceAuto(sn: string, ip: string, pushVersion?: string): Promise<boolean> {
  const settings = await getSettings();
  const existing = await db.device.findUnique({ where: { sn } });
  if (existing) return true;
  if (!settings.autoAcceptDevices) return false;
  // قبول تلقائي مع توثيق
  await db.device.create({
    data: { sn, name: `جهاز جديد ${sn.slice(-6)}`, status: 'online', lastSeenAt: new Date(), lastIp: ip, pushVersion },
  });
  await logAudit({
    action: 'sync', entity: 'device', entityId: sn,
    description: `قبول تلقائي لجهاز جديد: ${sn} — وثّقه في صفحة الأجهزة`,
  });
  return true;
}

/** GET: handshake أو keep-alive */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sn = (params.get('SN') || '').trim();
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  if (!sn) return new Response('BAD REQUEST', { status: 400 });
  if (admsRateLimited(sn)) return new Response('BUSY', { status: 429 });

  const settings = await getSettings();
  if (!settings.admsEnabled) return new Response('DISABLED', { status: 503 });

  const handshake = params.get('options') === 'all' || params.get('pushver');
  if (handshake) {
    const accepted = await upsertDeviceAuto(sn, ip, params.get('pushver') || undefined);
    if (!accepted) return new Response('SN NOT REGISTERED', { status: 403 });
    return new Response(handshakeResponse(new Date()), {
      status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // keep-alive — يُحدَّث الحالة فورًا
  const known = await touchDevice(sn, ip);
  if (!known) {
    const accepted = await upsertDeviceAuto(sn, ip);
    if (!accepted) return new Response('SN NOT REGISTERED', { status: 403 });
  }
  const commands = await getPendingCommand(sn);
  if (!commands.length) commands.push(DEVICE_COMMANDS.fetchAllLogs);
  return new Response(keepAliveResponse(commands), {
    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** POST: ATTLOG أو USERINFO أو FP */
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sn = (params.get('SN') || '').trim();
  const table = params.get('table') || 'ATTLOG';
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  if (!sn) return new Response('BAD REQUEST', { status: 400 });
  if (admsRateLimited(sn)) return new Response('BUSY', { status: 429 });

  const settings = await getSettings();
  if (!settings.admsEnabled) return new Response('DISABLED', { status: 503 });

  const device = await db.device.findUnique({ where: { sn } });
  if (!device) {
    const accepted = await upsertDeviceAuto(sn, ip);
    if (!accepted) return new Response('SN NOT REGISTERED', { status: 403 });
  }
  await db.device.update({
    where: { sn },
    data: { lastSeenAt: new Date(), lastIp: ip, status: 'online' },
  }).catch(() => {});

  const body = await req.text().catch(() => '');

  // ===== USERINFO: مزامنة أسماء وربط pin بموظف =====
  if (table === 'USERINFO' || table === 'FP') {
    const users = parseUSERINFO(body);
    let linked = 0;
    for (const u of users) {
      const emp = await resolveEmployeeByPin(u.pin);
      if (emp) linked++;
    }
    await logAudit({
      action: 'sync', entity: 'device', entityId: sn,
      description: `مزامنة مستخدمين من الجهاز ${sn}: ${users.length} مستخدمًا، ${linked} مربوطًا`,
    });
    return new Response('OK', { status: 200 });
  }

  // ===== ATTLOG: السجلات الخام — إضافة فقط بلا تعديل أبدًا (قاعدة 2) =====
  const punches = parseATTLOG(body);
  if (!punches.length) return new Response('OK', { status: 200 });

  let inserted = 0;
  let duplicates = 0;
  let unknownPins = new Set<string>();
  const affectedEmployees: string[] = [];

  for (const p of punches) {
    const emp = await resolveEmployeeByPin(p.pin);
    try {
      await db.attendanceLog.create({
        data: {
          sn,
          pin: p.pin,
          employeeId: emp?.id || null,
          punchTime: p.punchTime,
          status: p.status,
          verify: p.verify,
          workCode: p.workCode || null,
          source: 'adms',
        },
      });
      inserted++;
      if (emp) {
        if (!affectedEmployees.includes(emp.id)) affectedEmployees.push(emp.id);
      } else {
        unknownPins.add(p.pin);
      }
    } catch {
      // قيد فريد (sn,pin,punchTime,status) يمنع التكرار مهما أرسل الجهاز (قاعدة 3)
      duplicates++;
    }
  }

  // إعادة معالجة الحضور للأيام المتأثرة فورًا
  const today = dateKey();
  await recomputeDayForEmployees(affectedEmployees, today).catch(() => {});

  if (inserted > 0) {
    await logAudit({
      action: 'sync', entity: 'device', entityId: sn,
      description: `استقبال ${inserted} سجلة من الجهاز ${sn} (${duplicates} مكررة متجاهلة، ${unknownPins.size} pin غير معروف)`,
    });
  }

  return new Response('OK', { status: 200 });
}
