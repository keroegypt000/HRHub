import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';

/** GET — موظفو الشركة + كل الموظفين (للاختيار) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'employees');
    const { id } = await ctx.params;
    const employees = await db.employee.findMany({
      where: { status: { notIn: ['terminated', 'deceased'] } },
      select: { id: true, name: true, code: true, companyId: true, company: { select: { name: true } }, department: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
    });
    return ok({ members: employees.filter((e) => e.companyId === id), employees });
  });
}

/** POST {employeeIds} — ضم موظفين للشركة (ينقلهم من شركتهم السابقة) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    const company = await db.company.findUnique({ where: { id } });
    if (!company) return fail(404, 'الشركة غير موجودة');
    const body = (await req.json().catch(() => ({}))) as { employeeIds?: string[] };
    const ids = [...new Set((body.employeeIds || []).filter(Boolean))];
    if (!ids.length) return fail(400, 'اختر موظفًا واحدًا على الأقل');
    const moved = await db.employee.count({ where: { id: { in: ids }, companyId: { not: null }, NOT: { companyId: id } } });
    const r = await db.employee.updateMany({ where: { id: { in: ids } }, data: { companyId: id } });
    // مكان العمل التابع لشركة أخرى لم يعد صالحًا
    await db.employee.updateMany({ where: { id: { in: ids }, workLocation: { companyId: { not: id } } }, data: { workLocationId: null } });
    await logAudit({ userId: user.id, action: 'update', entity: 'company', entityId: id, description: `ضم ${r.count} موظف إلى شركة «${company.name}»${moved ? ` (${moved} نُقلوا من شركة أخرى)` : ''}` });
    return ok({ added: r.count, moved });
  });
}

/** DELETE ?employeeId= — إخراج موظف من الشركة */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    const employeeId = new URL(req.url).searchParams.get('employeeId') || '';
    await db.employee.updateMany({ where: { id: employeeId, companyId: id }, data: { companyId: null, workLocationId: null } });
    await logAudit({ userId: user.id, action: 'update', entity: 'company', entityId: id, description: 'إخراج موظف من الشركة' });
    return ok({ removed: true });
  });
}
