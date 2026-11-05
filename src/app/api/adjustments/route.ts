// /api/adjustments — الحوافز والجزاءات: بنود تُضاف للراتب تلقائيًا في شهرها أو كل شهر حتى تاريخ
import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

const MONTH = /^\d{4}-\d{2}$/;
const normalize = (data: Record<string, unknown>) => {
  if (data.amount !== undefined) data.amount = Math.abs(num(data.amount));
  if (data.untilMonth === '') data.untilMonth = null;
  return data;
};

export const cfg: CrudConfig = {
  model: 'payrollAdjustment',
  entity: 'adjustments',
  label: 'حافز/جزاء',
  searchFields: ['name', 'notes'],
  orderBy: { month: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
  validate: (data, mode) => {
    if (mode === 'create' && !data.employeeId) return 'اختر الموظف';
    if (mode === 'create' && !data.name) return 'أدخل الوصف';
    if (data.type !== undefined && !['earning', 'deduction'].includes(String(data.type))) return 'النوع: إضافة أو خصم';
    if ((mode === 'create' || data.month !== undefined) && !MONTH.test(String(data.month || ''))) return 'الشهر بصيغة YYYY-MM';
    if (data.untilMonth && !MONTH.test(String(data.untilMonth))) return 'آخر شهر بصيغة YYYY-MM';
    if (data.untilMonth && String(data.untilMonth) < String(data.month || '')) return 'آخر شهر قبل أول شهر';
    if (mode === 'create' && !(num(data.amount) > 0)) return 'أدخل المبلغ';
    return null;
  },
  beforeCreate: (data) => normalize(data),
  beforeUpdate: (data) => normalize(data),
  describe: (row) => `${row.name} (${row.amount} د.ك — ${row.month})`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'adjustments');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'adjustments');
    return crudCreate(req, user, cfg);
  });
}
