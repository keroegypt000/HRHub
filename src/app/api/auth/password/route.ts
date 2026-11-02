import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ok, fail, handle } from '@/lib/api';
import { hashPassword, makeSalt, verifyPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** تغيير كلمة السر الذاتية أو تصفير كلمة سر مستخدم آخر (مدير فقط) */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      currentPassword?: string; newPassword?: string; userId?: string; mode?: 'self' | 'reset';
    };

    if (body.mode === 'reset' && body.userId) {
      if (me.role !== 'admin') return fail(403, 'ليست لديك صلاحية — تصفير كلمة السر حق للمدير فقط');
      const target = await db.user.findUnique({ where: { id: body.userId } });
      if (!target) return fail(404, 'المستخدم غير موجود');
      const salt = makeSalt();
      const newPassword = body.newPassword || 'Hr@12345';
      await db.user.update({
        where: { id: target.id },
        data: { salt, passwordHash: hashPassword(newPassword, salt) },
      });
      await db.session.deleteMany({ where: { userId: target.id } }); // إبطال جلساته
      await logAudit({ userId: me.id, action: 'update', entity: 'user', entityId: target.id, description: `تصفير كلمة سر المستخدم: ${target.name}` });
      await createRestorePoint(me.id, `تصفير كلمة سر المستخدم: ${target.name}`);
      return ok({ reset: true, newPassword: body.newPassword ? undefined : newPassword });
    }

    // تغيير ذاتي
    const currentPassword = body.currentPassword || '';
    const newPassword = body.newPassword || '';
    if (newPassword.length < 6) return fail(400, 'كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل');
    const me2 = await db.user.findUnique({ where: { id: me.id } });
    if (!me2) return fail(404, 'المستخدم غير موجود');
    if (!verifyPassword(currentPassword, me2.salt, me2.passwordHash)) {
      return fail(400, 'كلمة السر الحالية غير صحيحة');
    }
    const salt = makeSalt();
    await db.user.update({ where: { id: me.id }, data: { salt, passwordHash: hashPassword(newPassword, salt) } });
    await logAudit({ userId: me.id, action: 'update', entity: 'user', entityId: me.id, description: 'تغيير كلمة السر الشخصية' });
    return ok({ changed: true });
  });
}
