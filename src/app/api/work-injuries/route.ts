import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'workInjury',
  entity: 'work-injuries',
  label: 'إصابة عمل',
  searchFields: ['place', 'injuryType', 'description', 'notes'],
  orderBy: { date: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { id: true, name: true } } } }, insurance: { select: { id: true, provider: true, policyNo: true } } },
  dateFields: ['date'],
  validate: (data, mode) => {
    if (mode === 'create') {
      if (!data.employeeId) return 'اختر الموظف';
      if (!data.date) return 'أدخل تاريخ الإصابة';
      if (!data.description) return 'اكتب وصف الإصابة';
    }
    return null;
  },
  describe: (row) => `${row.injuryType || 'إصابة عمل'}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'work-injuries');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'work-injuries');
    return crudCreate(req, user, cfg);
  });
}
