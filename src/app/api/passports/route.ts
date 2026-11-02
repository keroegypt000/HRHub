import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'passport',
  entity: 'passports',
  label: 'جواز سفر',
  searchFields: ['holderName', 'passportNo', 'nationality'],
  orderBy: { expiryDate: 'asc' }, // الأقرب انتهاءً أولًا — منطق التنبيه
  include: { employee: { select: { id: true, name: true, code: true } } },
  dateFields: ['issueDate', 'expiryDate'],
  validate: async (data, mode) => {
    if (mode === 'create') {
      if (!data.holderName && !data.employeeId) return 'اختر الموظف أو أدخل اسم صاحب الجواز';
      if (!data.passportNo) return 'أدخل رقم الجواز';
      if (!data.expiryDate) return 'أدخل تاريخ انتهاء الجواز';
    } else {
      // في التعديل: نتحقق فقط من الحقول المرسلة فعليًا
      if (data.holderName !== undefined && data.holderName === '' &&
          data.employeeId === undefined && data.employeeId === null) {
        return 'اختر الموظف أو أدخل اسم صاحب الجواز';
      }
    }
    return null;
  },
  describe: (row) => `${row.passportNo} — ${row.holderName}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'passports');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'passports');
    return crudCreate(req, user, cfg);
  });
}
