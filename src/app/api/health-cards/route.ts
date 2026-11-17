import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'healthCard',
  entity: 'health-cards',
  label: 'كرت صحي',
  searchFields: ['cardNo', 'issuer', 'notes'],
  orderBy: { expiryDate: 'asc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { id: true, name: true } } } } },
  dateFields: ['issueDate', 'expiryDate'],
  validate: (data, mode) => {
    if (mode === 'create') {
      if (!data.employeeId) return 'اختر الموظف';
      if (!data.expiryDate) return 'أدخل تاريخ انتهاء الكرت الصحي';
    }
    return null;
  },
  describe: (row) => `${row.cardNo || 'كرت صحي'}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'health-cards');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'health-cards');
    return crudCreate(req, user, cfg);
  });
}
