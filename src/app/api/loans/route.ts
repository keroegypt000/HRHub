import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle, ok, HttpError } from '@/lib/api';
import { crudList, CrudConfig } from '@/lib/crud';
import { db } from '@/lib/db';
import { round3 } from '@/lib/calc';

export const cfg: CrudConfig = {
  model: 'loan',
  entity: 'loans',
  label: 'سلفة/قرض',
  searchFields: ['name', 'notes'],
  orderBy: { createdAt: 'desc' },
  dateFields: ['startDate'],
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
  describe: (row) => {
    const emp = row.employee as { name?: string } | null | undefined;
    return `${row.name} — ${emp?.name || ''}`;
  },
};

/** قائمة القروض مع ملخص */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'loans');
    const res = await crudList(req, null as never, cfg);
    const data = await res.json() as { rows: Record<string, unknown>[]; total?: number };
    const rows = data.rows as unknown as {
      totalAmount: number; paidAmount: number; status: string; installmentsCount: number; paidInstallments: number;
    }[];
    const summary = {
      count: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      totalAmount: round3(rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)),
      outstanding: round3(rows.filter((r) => r.status === 'active').reduce((s, r) => s + ((Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0)), 0)),
    };
    return ok({ rows: data.rows, summary, total: data.total });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireWrite(req, 'loans');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const employeeId = String(body.employeeId || '');
    if (!employeeId) throw new HttpError(400, 'اختر الموظف');
    const total = Number(body.totalAmount) || 0;
    const count = Number(body.installmentsCount) || 0;
    if (!body.name) throw new HttpError(400, 'أدخل وصف السلفة/القرض');
    if (total <= 0 || count <= 0) throw new HttpError(400, 'أدخل المبلغ وعدد الأقساط');
    const monthly = body.monthlyDeduction !== undefined && body.monthlyDeduction !== '' && body.monthlyDeduction !== null
      ? Number(body.monthlyDeduction) : round3(total / count);
    if (monthly <= 0) throw new HttpError(400, 'قيمة القسط الشهري غير صحيحة');

    const loan = await db.loan.create({
      data: {
        employeeId,
        name: String(body.name),
        totalAmount: total,
        installmentsCount: count,
        monthlyDeduction: monthly,
        startDate: body.startDate ? new Date(String(body.startDate)) : new Date(),
        notes: body.notes ? String(body.notes) : null,
      },
      include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
    });
    return ok(loan, 201);
  });
}
