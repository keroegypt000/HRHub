// /api/ess/requests — طلبات الموظف: عرض طلباته وإنشاء طلب جديد بسلسلة الموافقات
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requireEmployee } from '@/lib/ess';
import { createEmployeeRequest } from '@/lib/request-flow';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { employeeId } = await requireEmployee(req);
    const rows = await db.employeeRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok({ rows });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { user, employeeId } = await requireEmployee(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // الموظف يطلب لنفسه فقط — يُتجاهل أي employeeId مرسل
    const request = await createEmployeeRequest(user, employeeId, String(body.type || ''), body);
    return ok(request, 201);
  });
}
