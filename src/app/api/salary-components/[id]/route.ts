import { NextRequest } from 'next/server';
import { requireWrite, handle } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { cfg } from '../route';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'salary-components');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'salary-components');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
