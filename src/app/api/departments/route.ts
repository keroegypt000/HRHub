import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'department',
  entity: 'departments',
  label: 'قسم',
  searchFields: ['name'],
  orderBy: { name: 'asc' },
  include: { parent: true, _count: { select: { employees: true } } },
  describe: (row) => String(row.name || ''),
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'departments');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'departments');
    return crudCreate(req, user, cfg);
  });
}
