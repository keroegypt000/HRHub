import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { dateKey } from '@/lib/time';

export const cfg: CrudConfig = {
  model: 'companyContract',
  entity: 'company-contracts',
  label: 'عقد شركة',
  searchFields: ['name', 'counterparty', 'contractNo', 'type'],
  orderBy: { endDate: 'asc' }, // الأقرب انتهاءً أولًا
  dateFields: ['startDate', 'endDate'],
  validate: async (data, mode) => {
    if (mode === 'create' || data.endDate !== undefined) {
      if (!data.name) return 'أدخل اسم/وصف العقد';
      if (!data.endDate) return 'أدخل تاريخ انتهاء العقد';
      if (data.startDate && data.endDate &&
          new Date(String(data.startDate)) > new Date(String(data.endDate))) {
        return 'تاريخ البداية يجب أن يسبق تاريخ النهاية';
      }
    }
    return null;
  },
  describe: (row) => `${row.name}${row.counterparty ? ` — ${row.counterparty}` : ''}`,
};

/** تحديث حالة عقود الشركة المنتهية — مع أول عملية في اليوم */
export async function refreshCompanyContractStatuses(): Promise<number> {
  const todayStart = new Date(`${dateKey()}T00:00:00.000+03:00`);
  const res = await db.companyContract.updateMany({
    where: { status: 'active', endDate: { lt: todayStart } },
    data: { status: 'expired' },
  });
  return res.count;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await refreshCompanyContractStatuses().catch(() => {});
    await requireRead(req, 'company-contracts');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'company-contracts');
    return crudCreate(req, user, cfg);
  });
}
