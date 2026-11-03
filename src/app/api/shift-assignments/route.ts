import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { crudList, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';

const cfg: CrudConfig = {
  model: 'shiftAssignment',
  entity: 'shift-assignments',
  label: 'توزيعة وردية',
  searchFields: [],
  orderBy: { fromDate: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true } }, shift: true },
  dateFields: ['fromDate', 'toDate'],
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'shift-assignments');
    return crudList(req, user, cfg);
  });
}

/**
 * توزيع ورديات — فردي أو جماعي (موظفون متعددون أو قسم كامل) بفترة سريان.
 * بعد الحفظ تُعاد معالجة الحضور للفترة تلقائيًا.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'shift-assignments');
    const body = (await req.json().catch(() => ({}))) as {
      employeeIds?: string[]; departmentId?: string; shiftId?: string;
      fromDate?: string; toDate?: string;
    };
    if (!body.shiftId) return fail(400, 'اختر الوردية');
    if (!body.fromDate) return fail(400, 'أدخل تاريخ بداية السريان');
    const shift = await db.shift.findUnique({ where: { id: body.shiftId } });
    if (!shift) return fail(404, 'الوردية غير موجودة');

    let employeeIds = body.employeeIds || [];
    if (body.departmentId) {
      const deptEmps = await db.employee.findMany({
        where: { departmentId: body.departmentId, status: 'active' },
        select: { id: true },
      });
      employeeIds = Array.from(new Set([...employeeIds, ...deptEmps.map((e) => e.id)]));
    }
    if (!employeeIds.length) return fail(400, 'اختر موظفًا أو قسمًا واحدًا على الأقل');

    const from = new Date(`${body.fromDate}T00:00:00.000+03:00`);
    const to = body.toDate ? new Date(`${body.toDate}T00:00:00.000+03:00`) : null;

    const created: string[] = [];
    for (const employeeId of employeeIds) {
      const row = await db.shiftAssignment.create({
        data: { employeeId, shiftId: body.shiftId, fromDate: from, toDate: to },
        include: { employee: true, shift: true },
      });
      created.push(row.id);
    }

    // إعادة معالجة الحضور من تاريخ السريان حتى اليوم (أو نهاية السريان)
    const today = dateKey();
    const recomputeTo = to && dateKey(to) < today ? dateKey(to) : today;
    // للموظفين الذين تغيرت ورديتهم فقط (كانت تعيد معالجة كل الشركة — دقائق لكل إسناد)
    await recomputeRange({ from: body.fromDate, to: recomputeTo, employeeIds }).catch(() => {});

    await logAudit({
      userId: user.id, action: 'create', entity: 'shift-assignment', entityId: created[0],
      description: `توزيع وردية «${shift.name}» على ${employeeIds.length} موظفًا من ${body.fromDate}`,
      changes: { employeeIds, shiftId: body.shiftId, fromDate: body.fromDate, toDate: body.toDate },
    });
    await createRestorePoint(user.id, `توزيع وردية ${shift.name} على ${employeeIds.length} موظفًا`);
    return ok({ created: created.length, ids: created }, 201);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shift-assignments');
    const { id } = await ctx.params;
    const existing = await db.shiftAssignment.findUnique({ where: { id }, include: { shift: true, employee: true } });
    if (!existing) return fail(404, 'التوزيعة غير موجودة');
    await db.shiftAssignment.delete({ where: { id } });
    await recomputeRange({ from: dateKey(existing.fromDate), to: dateKey(), employeeId: existing.employeeId }).catch(() => {});
    await logAudit({
      userId: user.id, action: 'delete', entity: 'shift-assignment', entityId: id,
      description: `حذف توزيعة وردية «${existing.shift?.name}» عن ${existing.employee?.name}`,
    });
    await createRestorePoint(user.id, 'حذف توزيعة وردية');
    return ok({ deleted: true });
  });
}
