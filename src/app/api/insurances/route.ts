import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'employeeInsurance',
  entity: 'insurances',
  label: 'وثيقة تأمين',
  searchFields: ['provider', 'policyNo', 'category', 'notes'],
  orderBy: { expiryDate: 'asc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { id: true, name: true } } } } },
  dateFields: ['startDate', 'expiryDate'],
  validate: (data, mode) => {
    if (data.kind !== undefined && !['health', 'accident'].includes(String(data.kind))) return 'نوع التأمين غير صحيح';
    if (mode === 'create') {
      if (!data.employeeId) return 'اختر الموظف';
      if (!data.provider) return 'أدخل شركة التأمين';
    }
    return null;
  },
  describe: (row) => `${row.kind === 'accident' ? 'تأمين حوادث' : 'تأمين صحي'} — ${row.provider}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'insurances');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'insurances');
    return crudCreate(req, user, cfg);
  });
}
