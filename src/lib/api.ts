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

/** غلاف موحد لمسارات الـ API: يلتقط الأخطاء ويرد بالعربية */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message);
    const msg = err instanceof Error ? err.message : String(err);
    // أخطاء القيود الفريدة وغيرها
    if (msg.includes('Unique constraint')) return fail(400, 'قيمة مكررة — توجد سجل بنفس المعرف بالفعل');
    if (msg.includes('Record to update not found') || msg.includes('Record not found'))
      return fail(404, 'السجل غير موجود');
    if (msg.includes('Foreign key constraint'))
      return fail(400, 'قيمة مرتبطة غير صحيحة — تأكد من اختيار القسم/الموظف/السجل المرتبط بشكل صحيح');
    // أخطاء تحقق Prisma (نوع خاطئ، حقل مفقود، قيمة غير صالحة) → رسالة مفهومة 400
    if (msg.includes('is missing') || msg.includes('Invalid value') || msg.includes('Unknown argument') ||
        msg.includes('Provided') || msg.includes('Invalid `prisma') || msg.includes('Got invalid')) {
      console.error('API validation error:', msg);
      return fail(400, 'بيانات غير صالحة — راجع الحقول الإجبارية وأنواع القيم (أرقام/تواريخ) ثم أعد المحاولة');
    }
    console.error('API error:', msg, err instanceof Error ? `\n${err.stack}` : '');
    return fail(500, 'حدث خطأ غير متوقع في الخادم');
  }
}

/** قراءة نص جسم الطلب الخام (للـ ADMS) */
export async function rawBody(req: NextRequest): Promise<string> {
  return await req.text();
}
