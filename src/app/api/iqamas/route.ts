import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'iqama',
  entity: 'iqamas',
  label: 'إقامة',
  searchFields: ['holderName', 'iqamaNo', 'nationality', 'sponsor'],
  orderBy: { expiryDate: 'asc' }, // الأقرب انتهاءً أولًا — منطق التنبيه
  include: { employee: { select: { id: true, name: true, code: true } } },
  dateFields: ['issueDate', 'expiryDate'],
  validate: async (data, mode) => {
    if (mode === 'create') {
      if (!data.holderName && !data.employeeId) return 'اختر الموظف أو أدخل اسم صاحب الإقامة';
      if (!data.iqamaNo) return 'أدخل رقم الإقامة';
      if (!data.expiryDate) return 'أدخل تاريخ انتهاء الإقامة';
    } else {
      if (data.holderName !== undefined && data.holderName === '' &&
          data.employeeId === undefined && data.employeeId === null) {
        return 'اختر الموظف أو أدخل اسم صاحب الإقامة';
      }
    }
    return null;
  },
  describe: (row) => `${row.iqamaNo} — ${row.holderName}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'iqamas');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'iqamas');
    return crudCreate(req, user, cfg);
  });
}
