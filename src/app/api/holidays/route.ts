import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'holiday',
  entity: 'holidays',
  label: 'عطلة رسمية',
  searchFields: ['name'],
  orderBy: { date: 'asc' },
  dateFields: ['date', 'endDate'],
  describe: (row) => `${row.name}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'holidays');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'holidays');
    return crudCreate(req, user, cfg);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'holidays');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'holidays');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
