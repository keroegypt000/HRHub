import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { num } from '@/lib/calc';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';
import { createLeaveRequest } from '@/lib/leaves';

/** قائمة طلبات الإجازة مع الأرصدة */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'leaves');
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    const rows = await db.leaveRequest.findMany({
      where,
      include: { employee: { select: { id: true, name: true, code: true, department: true } }, leaveType: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // حساب الرصيد المستهلك لكل موظف/نوع
    const approved = rows.filter((r) => r.status === 'approved');
    const usage: Record<string, number> = {};
    for (const r of approved) {
      usage[`${r.employeeId}:${r.leaveTypeId}`] = (usage[`${r.employeeId}:${r.leaveTypeId}`] || 0) + Number(r.days);
    }
    return ok({ rows, usage });
  });
}

/** إنشاء طلب إجازة — HR/مدير/مشرف (لفريقه) */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'leaves');
    const body = (await req.json().catch(() => ({}))) as {
      employeeId?: string; leaveTypeId?: string; fromDate?: string; toDate?: string; reason?: string;
    };
    if (!body.employeeId || !body.leaveTypeId || !body.fromDate || !body.toDate) {
      return fail(400, 'أكمل بيانات الطلب: الموظف، نوع الإجازة، من، إلى');
    }
    const from = new Date(`${body.fromDate}T00:00:00.000+03:00`);
    const to = new Date(`${body.toDate}T00:00:00.000+03:00`);
    const { created, emp, lt, days } = await createLeaveRequest({
      employeeId: body.employeeId, leaveTypeId: body.leaveTypeId, from, to, reason: body.reason,
    });

    await logAudit({
      userId: user.id, action: 'create', entity: 'leave', entityId: created.id,
      description: `طلب إجازة ${lt.name} للموظف ${emp.name} (${body.fromDate} → ${body.toDate}) ${days} يوم`,
    });
    await createRestorePoint(user.id, `طلب إجازة: ${emp.name}`);
    return ok(created, 201);
  });
}
