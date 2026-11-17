import { linkPunchesToEmployees } from '@/lib/link-punches';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { refreshContractStatuses } from '@/lib/contracts';
import { parseDayList } from '@/lib/workweek';
import { stripDocFields, syncEmployeeDocs } from '@/lib/employee-docs';

/** خيارات الموظف: يوم الراحة وأساس المكافأة — «حسب الوردية/افتراضي الشركة» تُخزن null */
function normalizeOptions(data: Record<string, unknown>): Record<string, unknown> {
  stripDocFields(data); // الجواز/الإقامة/الكرت الصحي تُحفظ في جداولها (syncEmployeeDocs)
  if (data.weeklyOffDays !== undefined) {
    const days = parseDayList(data.weeklyOffDays ? String(data.weeklyOffDays) : null);
    data.weeklyOffDays = days ? JSON.stringify(days) : null; // [] = بلا راحة أسبوعية
  }
  if (data.openingLeaveBalance !== undefined) {
    data.openingLeaveBalance = data.openingLeaveBalance === null || data.openingLeaveBalance === '' ? null : Number(data.openingLeaveBalance);
  }
  if (data.eosBasis !== undefined) {
    data.eosBasis = data.eosBasis === 'basic' || data.eosBasis === 'full_wage' ? data.eosBasis : null;
  }
  return data;
}

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
    passports: { orderBy: { expiryDate: 'desc' }, take: 1, select: { passportNo: true, expiryDate: true } },
    iqamas: { orderBy: { expiryDate: 'desc' }, take: 1, select: { iqamaNo: true, expiryDate: true } },
    healthCards: { orderBy: { expiryDate: 'desc' }, take: 1, select: { cardNo: true, expiryDate: true } },
  },
  dateFields: ['birthDate', 'hireDate', 'openingLeaveDate'],
  beforeCreate: async (data) => {
    // pin افتراضي = الرقم الوظيفي
    if (!data.pin && data.code) data.pin = String(data.code);
    if (data.basicSalary !== undefined) data.basicSalary = num(data.basicSalary);
    return normalizeOptions(data);
  },
  beforeUpdate: (data) => normalizeOptions(data),
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
    const body = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    const res = await crudCreate(req, user, cfg);
    // ربط بصماته السابقة المسجلة برقمه (لو أضيف بعد سحب البصمات من الجهاز)
    if (res.status >= 300) return res;
    // نقرأ الرد مرة واحدة ونعيد إرساله (نسخ الرد clone يُفرغ جسمه في سيرفر Next)
    const row = (await res.json().catch(() => null)) as { id?: string } | null;
    if (row?.id) await linkPunchesToEmployees([row.id]).catch(() => 0);
    if (row?.id) await syncEmployeeDocs(row.id, body).catch((e) => console.error('[employee-docs]', e));
    return NextResponse.json(row, { status: res.status });
  });
}
