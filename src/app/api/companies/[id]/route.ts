import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, handle, fail } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { cfg } from '../route';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'departments');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'departments');
    const { id } = await ctx.params;
    // لا يُحذف وعليه موظفون — يُوقف بدلًا من ذلك
    const used = await db.employee.count({ where: { companyId: id } });
    if (used) return fail(400, `لا يمكن الحذف: عليه ${used} موظف — انقلهم أولًا أو اجعله غير نشط`);
    return crudDelete(req, user, cfg, id);
  });
}
