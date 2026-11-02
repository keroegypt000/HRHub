import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'position',
  entity: 'positions',
  label: 'مسمى وظيفي',
  searchFields: ['name'],
  orderBy: { name: 'asc' },
  include: { _count: { select: { employees: true } } },
  describe: (row) => String(row.name || ''),
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'positions');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'positions');
    return crudCreate(req, user, cfg);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'positions');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'positions');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
