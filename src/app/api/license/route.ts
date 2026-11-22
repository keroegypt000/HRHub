import { NextRequest } from 'next/server';
import { ok, fail, handle } from '@/lib/api';
import { licenseStatus, activateLicense } from '@/lib/license';
import { logAudit } from '@/lib/audit';

/** حالة الترخيص ورقم الجهاز — متاحة قبل تسجيل الدخول (لشاشة التفعيل) */
export async function GET() {
  return handle(async () => ok(await licenseStatus()));
}

/** تفعيل بمفتاح ترخيص — المفتاح موقّع ومرتبط بالجهاز فلا خطر من إتاحته قبل الدخول */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { key?: string };
    if (!body.key || body.key.length < 40) return fail(400, 'الصق مفتاح الترخيص كاملًا');
    const err = await activateLicense(body.key);
    if (err) return fail(400, err);
    const st = await licenseStatus();
    await logAudit({ action: 'update', entity: 'license', description: `تفعيل ترخيص ${st.license?.id || ''} — ${st.license?.customer || ''}` }).catch(() => {});
    return ok(st);
  });
}
