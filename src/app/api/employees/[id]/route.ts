import { linkPunchesToEmployees } from '@/lib/link-punches';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { syncEmployeeDocs } from '@/lib/employee-docs';
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
    const body = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    const res = await crudUpdate(req, user, cfg, id);
    // ربط بصماته السابقة المسجلة برقمه (لو أضيف بعد سحب البصمات من الجهاز)
    if (res.status >= 300) return res;
    // نقرأ الرد مرة واحدة ونعيد إرساله (نسخ الرد clone يُفرغ جسمه في سيرفر Next)
    const row = (await res.json().catch(() => null)) as { id?: string } | null;
    if (row?.id) await linkPunchesToEmployees([row.id]).catch(() => 0);
    if (row?.id) await syncEmployeeDocs(row.id, body).catch((e) => console.error('[employee-docs]', e));
    return NextResponse.json(row, { status: res.status });
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
