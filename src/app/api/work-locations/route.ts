import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

// الصلاحية نفس الأقسام (هيكل الشركة)
export const cfg: CrudConfig = {
  model: 'workLocation',
  entity: 'work-locations',
  label: 'موقع عمل',
  searchFields: ['name', 'area', 'address'],
  orderBy: { name: 'asc' },
  include: { company: { select: { id: true, name: true } }, _count: { select: { employees: true } } },
  validate: (data, mode) => {
    if (mode === 'create' && !data.name) return 'اكتب اسم مكان العمل';
    return null;
  },
  describe: (row) => String(row.name),
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
