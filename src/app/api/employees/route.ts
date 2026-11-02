import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { refreshContractStatuses } from '@/lib/contracts';

export const cfg: CrudConfig = {
  model: 'employee',
  entity: 'employees',
  label: 'موظف',
  searchFields: ['name', 'code', 'civilId', 'phone'],
  orderBy: { code: 'asc' },
  include: {
    department: true, position: true,
    photo: { select: { id: true, fileName: true, mimeType: true } },
    _count: { select: { contracts: true, leaveRequests: true } },
  },
  dateFields: ['birthDate', 'hireDate'],
  beforeCreate: async (data) => {
    // pin افتراضي = الرقم الوظيفي
    if (!data.pin && data.code) data.pin = String(data.code);
    if (data.basicSalary !== undefined) data.basicSalary = num(data.basicSalary);
    return data;
  },
  describe: (row) => `${row.name} (${row.code})`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await refreshContractStatuses().catch(() => {}); // تحديث حالة العقود مع أول عملية (قاعدة 11)
    const user = await requireRead(req, 'employees');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    return crudCreate(req, user, cfg);
  });
}
