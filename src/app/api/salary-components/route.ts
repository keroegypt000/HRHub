import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

export const cfg: CrudConfig = {
  model: 'salaryComponent',
  entity: 'salary-components',
  label: 'مكوّن راتب',
  searchFields: ['name', 'code'],
  orderBy: { order: 'asc' },
  beforeCreate: (data) => {
    for (const f of ['value', 'percentOfBasic', 'order']) {
      if (data[f] !== undefined && data[f] !== null && data[f] !== '') data[f] = num(data[f]);
    }
    return data;
  },
  describe: (row) => `${row.name} (${row.code})`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'salary-components');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'salary-components');
    return crudCreate(req, user, cfg);
  });
}

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
