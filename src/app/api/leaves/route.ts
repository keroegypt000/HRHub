import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { num } from '@/lib/calc';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

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
    if (from > to) return fail(400, 'تاريخ البداية يجب أن يسبق النهاية');

    const emp = await db.employee.findUnique({ where: { id: body.employeeId } });
    if (!emp) return fail(404, 'الموظف غير موجود');
    const lt = await db.leaveType.findUnique({ where: { id: body.leaveTypeId } });
    if (!lt) return fail(404, 'نوع الإجازة غير موجود');

    const days = Math.round(((to.getTime() - from.getTime()) / (24 * 3600_000) + 1) * 10) / 10;

    const created = await db.leaveRequest.create({
      data: {
        employeeId: body.employeeId,
        leaveTypeId: body.leaveTypeId,
        fromDate: from,
        toDate: to,
        days,
        reason: body.reason || null,
        status: 'pending',
      },
      include: { employee: true, leaveType: true },
    });

    await logAudit({
      userId: user.id, action: 'create', entity: 'leave', entityId: created.id,
      description: `طلب إجازة ${lt.name} للموظف ${emp.name} (${body.fromDate} → ${body.toDate}) ${days} يوم`,
    });
    await createRestorePoint(user.id, `طلب إجازة: ${emp.name}`);
    return ok(created, 201);
  });
}
