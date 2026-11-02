import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

export const cfg: CrudConfig = {
  model: 'leaveType',
  entity: 'leave-types',
  label: 'نوع إجازة',
  searchFields: ['name', 'code'],
  orderBy: { name: 'asc' },
  include: { _count: { select: { requests: true } } },
  beforeCreate: (data) => {
    if (data.quotaDays !== undefined) data.quotaDays = data.quotaDays === null || data.quotaDays === '' ? null : num(data.quotaDays);
    return data;
  },
  describe: (row) => String(row.name || ''),
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'leave-types');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'leave-types');
    return crudCreate(req, user, cfg);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'leave-types');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'leave-types');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
