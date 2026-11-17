import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { recomputeRange } from '@/lib/attendance';
import { dateKey } from '@/lib/time';
import { activeAssignments, assignEmployees, endAssignment, recalcEmployeeHistory, inBackground, assignWholeHistory } from '@/lib/shift-members';

/** GET — موظفو الوردية الحاليون + كل الموظفين النشطين بورديتهم الحالية (للاختيار) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'shifts');
    const { id } = await ctx.params;
    const shift = await db.shift.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!shift) return fail(404, 'الوردية غير موجودة');
    const employees = await db.employee.findMany({
      where: { status: { in: ['active', 'on_leave', 'suspended'] } },
      select: { id: true, name: true, code: true, department: { select: { id: true, name: true } } },
      orderBy: [{ code: 'asc' }],
    });
    const current = await activeAssignments(employees.map((e) => e.id));
    const list = employees.map((e) => {
      const a = current.get(e.id);
      return {
        id: e.id, name: e.name, code: e.code, department: e.department,
        currentShift: a ? { id: a.shift.id, name: a.shift.name, assignmentId: a.id, fromDate: a.fromDate } : null,
      };
    });
    return ok({ shift, members: list.filter((e) => e.currentShift?.id === id), employees: list });
  });
}

/** POST — ربط موظفين بالوردية {employeeIds, fromDate, toDate?} */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { employeeIds?: string[]; fromDate?: string; toDate?: string | null; wholeHistory?: boolean };
    const shift = await db.shift.findUnique({ where: { id } });
    if (!shift) return fail(404, 'الوردية غير موجودة');
    const ids = (body.employeeIds || []).filter(Boolean);
    if (!ids.length) return fail(400, 'اختر موظفًا واحدًا على الأقل');
    const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate || '') ? (body.fromDate as string) : dateKey();
    if (body.wholeHistory) {
      const r = await assignWholeHistory(id, ids);
      // إعادة حساب كل سجل الموظفين في الخلفية (آلاف الأيام)
      inBackground((async () => { for (const e of ids) await recalcEmployeeHistory(e); })());
      await logAudit({
        userId: user.id, action: 'create', entity: 'shift-assignment', entityId: id,
        description: `ربط ${r.added} موظف بوردية «${shift.name}» على كل السجل السابق`,
      });
      return ok({ ...r, wholeHistory: true });
    }
    const r = await assignEmployees(id, ids, fromKey, body.toDate || null);
    const today = dateKey();
    if (fromKey <= today) await recomputeRange({ from: fromKey, to: today, employeeIds: ids }).catch(() => {});
    // الموظف بدون وردية سابقة: الوردية تغطي كل تاريخه — يُعاد حساب كل سجله في الخلفية
    inBackground((async () => { for (const e of ids) await recalcEmployeeHistory(e); })());
    await logAudit({
      userId: user.id, action: 'create', entity: 'shift-assignment', entityId: id,
      description: `ربط ${r.added} موظف بوردية «${shift.name}» من ${fromKey}${r.moved ? ` (${r.moved} نُقلوا من ورديات أخرى)` : ''}`,
    });
    return ok(r);
  });
}

/** DELETE ?assignmentId=..&date=YYYY-MM-DD — إخراج موظف من الوردية من تاريخ (الافتراضي اليوم) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    await ctx.params;
    const sp = new URL(req.url).searchParams;
    const assignmentId = sp.get('assignmentId') || '';
    const dateParam = sp.get('date') || '';
    const endKey = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dateKey();
    const a = await endAssignment(assignmentId, endKey);
    if (!a) return fail(404, 'التوزيعة غير موجودة');
    const today = dateKey();
    if (endKey <= today) await recomputeRange({ from: endKey, to: today, employeeIds: [a.employeeId] }).catch(() => {});
    await logAudit({ userId: user.id, action: 'update', entity: 'shift-assignment', entityId: assignmentId, description: `إخراج موظف من الوردية من ${endKey}` });
    return ok({ ended: true });
  });
}
