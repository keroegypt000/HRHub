// /api/settings/test-email — رسالة تجربة لإعدادات SMTP (مدير فقط) — تُرسل حتى لو كان الإرسال معطلًا
import { NextRequest } from 'next/server';
import { requireWrite, handle, ok, HttpError } from '@/lib/api';
import { sendMail } from '@/lib/mail';
import { getSettings } from '@/lib/settings';

export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireWrite(req, 'settings');
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const to = (body.to || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'أدخل بريدًا صحيحًا');
    const s = await getSettings();
    if (!s.smtpHost) throw new HttpError(400, 'أدخل خادم SMTP واحفظ الإعدادات أولًا');
    try {
      await sendMail({
        to: [to],
        subject: `رسالة تجربة — ${s.companyName}`,
        html: `<div dir="rtl" style="font-family:Tahoma,Arial">إعدادات البريد في ${s.companyName} تعمل بنجاح ✅</div>`,
      }, { force: true });
    } catch (err) {
      throw new HttpError(400, `فشل الإرسال: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
    return ok({ sent: true });
  });
}
