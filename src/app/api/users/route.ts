import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { hashPassword, makeSalt, canRead, canWrite, ROLES } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** قائمة المستخدمين — مدير فقط */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'users');
    const rows = await db.user.findMany({
      select: {
        id: true, username: true, name: true, role: true, permissions: true,
        active: true, createdAt: true, updatedAt: true,
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return ok({ rows });
  });
}

/** إنشاء مستخدم — مدير فقط */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'users');
    const body = (await req.json().catch(() => ({}))) as {
      username?: string; name?: string; password?: string; role?: string; permissions?: string;
    };
    const username = (body.username || '').trim();
    if (!username) return fail(400, 'أدخل اسم المستخدم');
    if (!body.password || body.password.length < 6) return fail(400, 'كلمة السر 6 أحرف على الأقل');
    const role = body.role || 'viewer';
    if (!ROLES[role]) return fail(400, 'دور غير معروف');
    if (body.permissions) {
      try { JSON.parse(body.permissions); } catch { return fail(400, 'صلاحيات JSON غير صالحة'); }
    }

    const exists = await db.user.findUnique({ where: { username } });
    if (exists) return fail(400, 'اسم المستخدم موجود مسبقًا');

    const salt = makeSalt();
    const created = await db.user.create({
      data: {
        username, name: body.name?.trim() || username,
        salt, passwordHash: hashPassword(body.password, salt),
        role, permissions: body.permissions || null, active: true,
      },
    });
    await logAudit({
      userId: user.id, action: 'create', entity: 'user', entityId: created.id,
      description: `إنشاء مستخدم: ${created.name} (${ROLES[role]})`,
    });
    await createRestorePoint(user.id, `إنشاء مستخدم: ${created.name}`);
    return ok({ id: created.id, username: created.username, name: created.name, role: created.role }, 201);
  });
}
