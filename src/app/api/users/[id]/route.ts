import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { hashPassword, makeSalt, ROLES } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** تعديل مستخدم: دور/صلاحيات/تفعيل/كلمة سر — مدير فقط */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireWrite(req, 'users');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string; role?: string; permissions?: string | null; active?: boolean; password?: string;
    };
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return fail(404, 'المستخدم غير موجود');
    if (target.role === 'admin' && (body.active === false || (body.role && body.role !== 'admin'))) {
      const others = await db.user.count({ where: { role: 'admin', active: true, id: { not: id } } });
      if (others === 0) return fail(400, 'لا يمكن تعطيل أو تخفيض آخر مدير نشط في النظام');
    }
    if (body.role && !ROLES[body.role]) return fail(400, 'دور غير معروف');
    if (body.permissions) {
      try { JSON.parse(body.permissions); } catch { return fail(400, 'صلاحيات JSON غير صالحة'); }
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.role !== undefined) data.role = body.role;
    if (body.permissions !== undefined) data.permissions = body.permissions;
    if (body.active !== undefined) data.active = body.active;
    if (body.password) {
      if (body.password.length < 6) return fail(400, 'كلمة السر 6 أحرف على الأقل');
      const salt = makeSalt();
      data.salt = salt;
      data.passwordHash = hashPassword(body.password, salt);
      await db.session.deleteMany({ where: { userId: id } });
    }

    const updated = await db.user.update({ where: { id }, data });
    await logAudit({
      userId: admin.id, action: 'update', entity: 'user', entityId: id,
      changes: { role: body.role, active: body.active, name: body.name, passwordChanged: !!body.password },
      description: `تعديل مستخدم: ${updated.name}`,
    });
    await createRestorePoint(admin.id, `تعديل مستخدم: ${updated.name}`);
    return ok({ id: updated.id, username: updated.username, name: updated.name, role: updated.role, active: updated.active, permissions: updated.permissions });
  });
}

/** حذف مستخدم — مدير فقط ولا يُحذف آخر مدير */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireWrite(req, 'users');
    const { id } = await ctx.params;
    if (id === admin.id) return fail(400, 'لا يمكن حذف حسابك الشخصي');
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return fail(404, 'المستخدم غير موجود');
    if (target.role === 'admin') {
      const others = await db.user.count({ where: { role: 'admin', id: { not: id } } });
      if (others === 0) return fail(400, 'لا يمكن حذف آخر مدير في النظام');
    }
    await db.user.delete({ where: { id } });
    await logAudit({ userId: admin.id, action: 'delete', entity: 'user', entityId: id, description: `حذف مستخدم: ${target.name}` });
    await createRestorePoint(admin.id, `حذف مستخدم: ${target.name}`);
    return ok({ deleted: true });
  });
}
