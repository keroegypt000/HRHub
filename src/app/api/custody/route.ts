// /api/custody — العُهد المسلَّمة للموظفين: لابتوب/هاتف/سيارة/أدوات/زي/مفاتيح
import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

const normalize = (data: Record<string, unknown>) => {
  for (const f of ['value', 'deductionAmount']) if (data[f] !== undefined) data[f] = num(data[f]);
  if (data.quantity !== undefined) data.quantity = Math.max(1, Math.round(num(data.quantity, 1)));
  // الاستلام يضبط تاريخه تلقائيًا، والرجوع لـ«مسلَّمة» يمسحه
  if (data.status === 'returned' && !data.returnedAt) data.returnedAt = new Date();
  if (data.status === 'issued') data.returnedAt = null;
  return data;
};

export const cfg: CrudConfig = {
  model: 'custody',
  entity: 'custody',
  label: 'عهدة',
  searchFields: ['itemName', 'serialNo', 'notes'],
  orderBy: { issuedAt: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
  dateFields: ['issuedAt', 'returnedAt'],
  validate: (data, mode) => {
    if (mode === 'create' && !data.employeeId) return 'اختر الموظف';
    if (mode === 'create' && !data.itemName) return 'أدخل اسم العهدة';
    if (mode === 'create' && !data.issuedAt) return 'أدخل تاريخ التسليم';
    return null;
  },
  beforeCreate: (data) => normalize(data),
  beforeUpdate: (data) => normalize(data),
  describe: (row) => {
    const emp = row.employee as { name?: string } | undefined;
    return `${row.itemName}${emp?.name ? ` — ${emp.name}` : ''}`;
  },
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'custody');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'custody');
    return crudCreate(req, user, cfg);
  });
}
