import { db } from '@/lib/db';
import { ok, handle } from '@/lib/api';

/** هل يحتاج النظام إعدادًا أول؟ (عدم وجود أي مستخدم) */
export async function GET() {
  return handle(async () => {
    const count = await db.user.count();
    return ok({ setupNeeded: count === 0 });
  });
}
