import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handle } from '@/lib/api';
import { hashPassword, makeSalt } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { seedDefaults } from '@/lib/seed';

/** شاشة الإعداد الأول: إنشاء حساب المدير الأول + البيانات الافتراضية */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const count = await db.user.count();
    if (count > 0) return fail(403, 'النظام مهيأ مسبقًا — استخدم شاشة تسجيل الدخول');

    const body = (await req.json().catch(() => ({}))) as {
      username?: string; name?: string; password?: string; companyName?: string;
    };
    const username = (body.username || '').trim();
    const name = (body.name || '').trim() || 'مدير النظام';
    const password = body.password || '';
    if (!username) return fail(400, 'أدخل اسم المستخدم');
    if (password.length < 8) return fail(400, 'كلمة سر المدير يجب أن تكون 8 أحرف على الأقل');

    const salt = makeSalt();
    const admin = await db.user.create({
      data: {
        username,
        name,
        salt,
        passwordHash: hashPassword(password, salt),
        role: 'admin',
        active: true,
      },
    });

    await seedDefaults();
    if (body.companyName) {
      const { saveSettings } = await import('@/lib/settings');
      await saveSettings({ companyName: body.companyName });
    }

    await logAudit({
      userId: admin.id, action: 'create', entity: 'user', entityId: admin.id,
      description: `إنشاء حساب المدير الأول: ${name} + تهيئة البيانات الافتراضية`,
    });

    return ok({ created: true, username, name });
  });
}
