// /iclock/devicecmd — الجهاز يبلغ بنتيجة تنفيذ الأوامر (ID=..&Return=..&CMD=..)
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => '');
  if (body) console.log(`[adms] devicecmd ${req.nextUrl.searchParams.get('SN') || ''}: ${body.slice(0, 200)}`);
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET() {
  return new Response('OK', { status: 200 });
}
