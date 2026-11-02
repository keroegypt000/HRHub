import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { cfg } from '../route';

/** ملف الموظف الكامل بكل العلاقات (لتبويبات الملف) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'employees');
    const { id } = await ctx.params;
    const emp = await db.employee.findUnique({
      where: { id },
      include: {
        department: true, position: true,
        photo: { select: { id: true, fileName: true, mimeType: true } },
        contracts: { orderBy: { startDate: 'desc' }, include: { renewals: true, renewalOf: true } },
        shiftAssignments: { orderBy: { fromDate: 'desc' }, include: { shift: true }, take: 20 },
        leaveRequests: { orderBy: { fromDate: 'desc' }, include: { leaveType: true }, take: 50 },
        payslips: { orderBy: { createdAt: 'desc' }, include: { period: true }, take: 12 },
        files: { orderBy: { createdAt: 'desc' } },
        dailyAttendance: { orderBy: { date: 'desc' }, take: 60 },
      },
    });
    if (!emp) return ok({ error: 'الموظف غير موجود' }, 404);
    return ok(emp);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
