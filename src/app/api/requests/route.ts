// /api/requests — طلبات الموظفين العامة بسلسلة موافقات (9 أنواع × 4 مستويات)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok } from '@/lib/api';
import { createEmployeeRequest } from '@/lib/request-flow';

/** قائمة الطلبات مع فلاتر */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'requests');
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const employeeId = url.searchParams.get('employeeId');
    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (type && type !== 'all') where.type = type;
    if (employeeId && employeeId !== 'all') where.employeeId = employeeId;

    const rows = await db.employeeRequest.findMany({
      where,
      include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return ok({ rows });
  });
}

/** إنشاء طلب جديد — يبني سلسلة الموافقات تلقائيًا من إعدادات الوحدة */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'requests');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const request = await createEmployeeRequest(user, String(body.employeeId || ''), String(body.type || ''), body);
    return ok(request, 201);
  });
}
