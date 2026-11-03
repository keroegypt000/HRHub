// /api/employees/[id]/account — حساب بوابة الموظف (ESS): عرض/إنشاء/إعادة تعيين كلمة السر/إيقاف
// للمدير والموارد البشرية فقط. كلمة السر المولدة تُعرض مرة واحدة في الرد ولا تُحفظ نصًا
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireWrite, handle, ok, HttpError } from '@/lib/api';
import { hashPassword, makeSalt, AuthUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

function requireHr(user: AuthUser) {
  if (user.role !== 'admin' && user.role !== 'hr') throw new HttpError(403, 'إدارة حسابات الموظفين للمدير والموارد البشرية فقط');
}

/** كلمة سر مؤقتة سهلة القراءة: 10 أحرف بلا أحرف ملتبسة */
function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('');
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    requireHr(user);
    const { id } = await ctx.params;
    const account = await db.user.findUnique({
      where: { employeeId: id },
      select: { id: true, username: true, email: true, active: true, role: true, createdAt: true },
    });
    return ok({ account });
  });
}

/** إنشاء الحساب أو إعادة تعيين كلمة السر — body: { username?, email?, password? } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    requireHr(user);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { username?: string; email?: string; password?: string };

    const emp = await db.employee.findUnique({ where: { id } });
    if (!emp) throw new HttpError(404, 'الموظف غير موجود');

    const password = (body.password || '').trim() || tempPassword();
    if (password.length < 8) throw new HttpError(400, 'كلمة السر 8 أحرف على الأقل');
    const salt = makeSalt();
    const existing = await db.user.findUnique({ where: { employeeId: id } });

    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: { salt, passwordHash: hashPassword(password, salt), active: true, email: body.email?.trim() || existing.email },
      });
      await db.session.deleteMany({ where: { userId: existing.id } }); // تسجيل خروج من كل الأجهزة
      await logAudit({ userId: user.id, action: 'update', entity: 'user', entityId: existing.id, description: `إعادة تعيين كلمة سر بوابة الموظف: ${emp.name} (${emp.code})` });
      return ok({ username: existing.username, password });
    }

    const username = (body.username || emp.code).trim();
    if (await db.user.findUnique({ where: { username } })) throw new HttpError(400, `اسم المستخدم «${username}» مستخدم بالفعل — اختر اسمًا آخر`);
    const created = await db.user.create({
      data: {
        username, name: emp.name, role: 'employee', employeeId: id, active: true,
        email: body.email?.trim() || emp.email || null,
        salt, passwordHash: hashPassword(password, salt),
      },
    });
    await logAudit({ userId: user.id, action: 'create', entity: 'user', entityId: created.id, description: `إنشاء حساب بوابة الموظف: ${emp.name} (${emp.code})` });
    return ok({ username, password }, 201);
  });
}

/** إيقاف الحساب (لا يُحذف — يبقى للتدقيق) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    requireHr(user);
    const { id } = await ctx.params;
    const existing = await db.user.findUnique({ where: { employeeId: id } });
    if (!existing) throw new HttpError(404, 'لا يوجد حساب لهذا الموظف');
    await db.user.update({ where: { id: existing.id }, data: { active: false } });
    await db.session.deleteMany({ where: { userId: existing.id } });
    await logAudit({ userId: user.id, action: 'update', entity: 'user', entityId: existing.id, description: `إيقاف حساب بوابة الموظف: ${existing.name}` });
    return ok({ disabled: true });
  });
}
