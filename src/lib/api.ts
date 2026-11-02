// lib/api.ts — مساعدات موحدة لمسارات الـ API: أخطاء عربية، مصادقة، صلاحيات
import { NextRequest, NextResponse } from 'next/server';
import { AuthUser, canRead, canWrite, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data as object, { status: init || 200 });
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** يرجّع المستخدم الحالي أو يرمي 401 */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, 'غير مصرح — يجب تسجيل الدخول');
  return user;
}

/** تحقق قراءة */
export async function requireRead(req: NextRequest, entity: string): Promise<AuthUser> {
  const user = await requireUser(req);
  if (!canRead(user, entity)) {
    await logAudit({ userId: user.id, action: 'denied', entity, description: `محاولة قراءة مرفوضة لقسم ${entity}` });
    throw new HttpError(403, 'ليست لديك صلاحية لقراءة هذا القسم');
  }
  return user;
}

/** تحقق كتابة */
export async function requireWrite(req: NextRequest, entity: string): Promise<AuthUser> {
  const user = await requireUser(req);
  if (!canWrite(user, entity)) {
    await logAudit({ userId: user.id, action: 'denied', entity, description: `محاولة كتابة مرفوضة لقسم ${entity}` });
    throw new HttpError(403, 'ليست لديك صلاحية للكتابة في هذا القسم');
  }
  return user;
}

/** رسالة خطأ قصيرة آمنة للعرض */
function brief(msg: string, max = 240): string {
  return msg.replace(/\s+/g, ' ').slice(0, max);
}

/** غلاف موحد لمسارات الـ API: يلتقط الأخطاء ويرد بالعربية */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message);

    // استخراج كود Prisma والرسالة الحقيقية — بدل إخفائها خلف رسالة عامة
    const e = err as { code?: string; message?: string; meta?: Record<string, unknown> };
    const code = e?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    const meta = (e?.meta && typeof e.meta === 'object') ? e.meta : null;

    // تسجيل كامل في لوج الخادم (يظهر في Vercel Logs)
    console.error('════ API ERROR ════', new Date().toISOString());
    console.error('code:', code || '—');
    console.error('message:', msg);
    if (meta) console.error('meta:', JSON.stringify(meta));
    if (err instanceof Error && err.stack) console.error(err.stack);

    // أخطاء Prisma المعروفة بأكوادها → رسالة عربية تحدد المشكلة بالضبط
    if (code === 'P2021' || code === 'P2022') {
      const target = String(meta?.table || meta?.column || 'غير محدد');
      return fail(500, `قاعدة البيانات غير مكتملة: ${code === 'P2021' ? 'الجدول' : 'العمود'} «${target}» غير موجود — نفّذ prisma db push أو سكربت الترحيل ثم أعد المحاولة (كود ${code})`);
    }
    if (code === 'P2003') return fail(400, 'قيمة مرتبطة غير صحيحة — السجل المرتبط (قسم/موظف/عقد...) غير موجود أو محذوف');
    if (code === 'P2002') {
      const target = String(meta?.target || '').replace(/[^a-zA-Z_,]/g, '');
      return fail(400, `قيمة مكررة — يوجد سجل آخر بنفس القيمة${target ? ` (${target})` : ''}`);
    }
    if (code === 'P2025') return fail(404, 'السجل غير موجود — ربما حُذف بواسطة مستخدم آخر');
    if (code === 'P1001' || code === 'P1000') return fail(500, `تعذر الاتصال بقاعدة البيانات (كود ${code}) — تحقق من DATABASE_URL`);
    if (code.startsWith('P')) return fail(500, `خطأ قاعدة بيانات (${code}): ${brief(msg)}`);

    // أخطاء قيود عامة (نصوص بدون كود)
    if (msg.includes('Unique constraint')) return fail(400, 'قيمة مكررة — توجد سجل بنفس المعرف بالفعل');
    if (msg.includes('Record to update not found') || msg.includes('Record not found'))
      return fail(404, 'السجل غير موجود');
    if (msg.includes('Foreign key constraint'))
      return fail(400, 'قيمة مرتبطة غير صحيحة — تأكد من اختيار القسم/الموظف/السجل المرتبط بشكل صحيح');
    // أخطاء تحقق Prisma (نوع خاطئ، حقل مفقود، قيمة غير صالحة) → رسالة مفهومة 400
    if (msg.includes('is missing') || msg.includes('Invalid value') || msg.includes('Unknown argument') ||
        msg.includes('Provided') || msg.includes('Invalid `prisma') || msg.includes('Got invalid')) {
      return fail(400, `بيانات غير صالحة: ${brief(msg)}`);
    }
    return fail(500, `حدث خطأ غير متوقع في الخادم: ${brief(msg)}`);
  }
}

/** قراءة نص جسم الطلب الخام (للـ ADMS) */
export async function rawBody(req: NextRequest): Promise<string> {
  return await req.text();
}
