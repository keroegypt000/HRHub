import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle } from '@/lib/api';

/** سجل التدقيق — مدير فقط، بحث وفلترة وحد صفحات */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'audit');
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
    const action = url.searchParams.get('action');
    const entity = url.searchParams.get('entity');
    const search = url.searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};
    if (action && action !== 'all') where.action = action;
    if (entity && entity !== 'all') where.entity = entity;
    if (search) where.description = { contains: search };

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);
    return ok({ rows, total, page, limit });
  });
}
