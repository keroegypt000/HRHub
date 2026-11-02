import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createSession, loginRateLimit, recordFailedLogin, clearFailedLogins } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { handle, ok, fail } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
    const username = (body.username || '').trim();
    const password = body.password || '';
    if (!username || !password) return fail(400, 'أدخل اسم المستخدم وكلمة السر');

    const key = `${username}:${req.headers.get('x-forwarded-for') || 'local'}`;
    const rl = loginRateLimit(key);
    if (rl.locked) {
      return fail(429, `تم قفل الحساب مؤقتًا — حاول بعد ${rl.remainingSec} ثانية`);
    }

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      recordFailedLogin(key);
      return fail(401, 'اسم المستخدم أو كلمة السر غير صحيحة');
    }
    if (!user.active) return fail(403, 'الحساب موقوف — راجع مدير النظام');

    clearFailedLogins(key);
    const { token, expiresAt } = await createSession(user.id);
    await logAudit({ userId: user.id, action: 'login', entity: 'user', entityId: user.id, description: `تسجيل دخول: ${user.name}` });

    const res = ok({
      user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions },
      token,
      expiresAt,
    });
    res.cookies.set('sid', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 3600,
    });
    return res as NextResponse;
  });
}
