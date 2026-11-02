import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { checkContractOverlap, refreshContractStatuses } from '@/lib/contracts';

export const cfg: CrudConfig = {
  model: 'contract',
  entity: 'contracts',
  label: 'عقد',
  searchFields: ['contractNo'],
  orderBy: { startDate: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true } }, renewalOf: true },
  dateFields: ['startDate', 'endDate', 'terminatedAt'],
  validate: async (data, mode) => {
    if (mode === 'create' || data.startDate) {
      if (!data.employeeId) return 'اختر الموظف';
      if (!data.startDate) return 'أدخل تاريخ بداية العقد';
      if (!data.basicSalary && data.basicSalary !== 0) return 'أدخل الراتب الأساسي';
      if (data.endDate && new Date(String(data.startDate)) > new Date(String(data.endDate))) {
        return 'تاريخ البداية يجب أن يسبق تاريخ النهاية';
      }
      // منع تداخل العقود النشطة (قاعدة 10)
      const overlap = await checkContractOverlap({
        employeeId: String(data.employeeId),
        contractId: data.__id as string | undefined,
        startDate: new Date(String(data.startDate)),
        endDate: data.endDate ? new Date(String(data.endDate)) : null,
      });
      if (overlap) return `تعارض في العقود: ${overlap}`;
    }
    return null;
  },
  beforeCreate: async (data) => {
    if (!data.contractNo) {
      const count = await db.contract.count();
      data.contractNo = `CT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    }
    for (const f of ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowance', 'hoursPerDay']) {
      if (data[f] !== undefined) data[f] = num(data[f]);
    }
    return data;
  },
  describe: (row) => `${row.contractNo}`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await refreshContractStatuses().catch(() => {});
    const user = await requireRead(req, 'contracts');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'contracts');
    return crudCreate(req, user, cfg);
  });
}
