import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle } from '@/lib/api';

/** قائمة نقاط الاستعادة — مدير فقط (بلا محتوى اللقطة) */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'restore');
    const rows = await db.restorePoint.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, description: true, createdAt: true, user: { select: { name: true } } },
    });
    return ok({ rows });
  });
}
