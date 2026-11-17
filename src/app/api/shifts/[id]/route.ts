import { NextRequest } from 'next/server';
import { requireWrite, handle } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { cfg } from '../route';
import { recalcShift, inBackground } from '@/lib/shift-members';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    const res = await crudUpdate(req, user, cfg, id);
    // تعديل السماحية/المواعيد يعيد حساب الأيام السابقة على الوردية (في الخلفية)
    if (res.ok) inBackground(recalcShift(id));
    return res;
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
