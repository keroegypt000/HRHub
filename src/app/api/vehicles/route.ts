import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'vehicle',
  entity: 'vehicles',
  label: 'مركبة',
  searchFields: ['plateNo', 'make', 'model', 'driverName'],
  orderBy: { plateNo: 'asc' },
  dateFields: ['licenseExpiry', 'insuranceExpiry', 'inspectionExpiry'],
  validate: async (data, mode) => {
    if (mode === 'create' || data.plateNo !== undefined) {
      if (!data.plateNo) return 'أدخل رقم اللوحة';
    }
    return null;
  },
  describe: (row) => `${row.plateNo}${row.make ? ` — ${row.make}` : ''}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'vehicles');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'vehicles');
    return crudCreate(req, user, cfg);
  });
}
