// /iclock/getrequest — الجهاز يسأل كل بضع ثوانٍ: هل عندك أوامر لي؟
// نرد بالأوامر المعلقة (C:<id>:<cmd>) أو OK، ونحدّث حالة الجهاز (متصل)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { takeCommands } from '@/lib/zk/adms';

const lastTouch = new Map<string, number>();
const TOUCH_MS = 60_000;

export async function GET(req: NextRequest) {
  const sn = (req.nextUrl.searchParams.get('SN') || '').trim();
  if (!sn) return new Response('BAD REQUEST', { status: 400 });
  const settings = await getSettings();
  if (!settings.admsEnabled) return new Response('DISABLED', { status: 503 });

  const now = Date.now();
  if (now - (lastTouch.get(sn) || 0) > TOUCH_MS) {
    lastTouch.set(sn, now);
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const res = await db.device.updateMany({ where: { sn }, data: { lastSeenAt: new Date(), status: 'online', ...(ip ? { lastIp: ip } : {}) } }).catch(() => ({ count: 0 }));
    if (!res.count) return new Response('SN NOT REGISTERED', { status: 403 });
  }

  const commands = await takeCommands(sn);
  return new Response(commands.length ? commands.join('\n') : 'OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
