// /iclock/ping — نقطة اختبار بسيطة للأجهزة
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const sn = (req.nextUrl.searchParams.get('SN') || '').trim();
  if (!sn) return new Response('BAD REQUEST', { status: 400 });
  const device = await db.device.findUnique({ where: { sn } });
  if (!device) return new Response('SN NOT REGISTERED', { status: 403 });
  return new Response(`OK ${device.name}`, { status: 200 });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
