import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok, HttpError } from '@/lib/api';
import { crudList, CrudConfig } from '@/lib/crud';
import { DEPARTURE_REASONS } from '@/lib/indemnity';
import { buildSettlementDetail } from '@/lib/settlement';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

export const cfg: CrudConfig = {
  model: 'departureSettlement',
  entity: 'settlements',
  label: 'تسوية مستحقات',
  searchFields: ['notes'],
  orderBy: { departureDate: 'desc' },
  include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
  dateFields: ['departureDate', 'paidAt'],
  describe: (row) => {
    const emp = row.employee as { name?: string; code?: string } | null | undefined;
    return emp?.name ? `${emp.name} (${emp.code})` : String(row.id);
  },
};

interface SettlementRowLite extends Record<string, unknown> {
  id: string; status: string; totalDue: number; paidAmount: number;
}

/** قائمة التسويات مع ملخص إجمالي */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'settlements');
    const res = await crudList(req, null as never, cfg);
    const data = await res.json() as { rows: Record<string, unknown>[]; total?: number };
    const rows = data.rows as unknown as SettlementRowLite[];
    const sum = (f: string) => Math.round(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0) * 1000) / 1000;
    const summary = {
      count: rows.length,
      totalDue: sum('totalDue'),
      paidAmount: sum('paidAmount'),
      remaining: Math.round((sum('totalDue') - sum('paidAmount')) * 1000) / 1000,
      pending: rows.filter((r) => r.status === 'pending').length,
      partial: rows.filter((r) => r.status === 'partial').length,
      paid: rows.filter((r) => r.status === 'paid').length,
    };
    return ok({ rows, summary, total: data.total });
  });
}

/** إنشاء تسوية نهاية خدمة — يحدّث حالة الموظف تلقائيًا (منصرف/متوفى) */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'settlements');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const employeeId = String(body.employeeId || '');
    if (!employeeId) throw new HttpError(400, 'اختر الموظف');
    const reason = String(body.reason || 'terminated');
    if (!DEPARTURE_REASONS.some((r) => r.value === reason)) throw new HttpError(400, 'سبب نهاية الخدمة غير صحيح');
    const departureDate = body.departureDate ? new Date(String(body.departureDate)) : null;
    if (!departureDate || Number.isNaN(departureDate.getTime())) throw new HttpError(400, 'أدخل تاريخ نهاية الخدمة');

    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 },
        settlements: { select: { id: true } },
      },
    });
    if (!emp) throw new HttpError(404, 'الموظف غير موجود');

    // التفاصيل الكاملة (أساس المكافأة + شرائح بالأيام + تعويض إجازات تلقائي + قروض + راتب شهر الترك)
    const detail = await buildSettlementDetail({
      employeeId,
      hireDate: body.hireDate ? new Date(String(body.hireDate)) : emp.hireDate,
      departureDate,
      reason,
      lastWage: body.lastWage as number | null | undefined,
      eosBasis: body.eosBasis as string | null | undefined,
      leaveAllowance: body.leaveAllowance,
      otherDues: body.otherDues,
      deductions: body.deductions,
    });

    // معاينة فقط — نفس حساب الحفظ بالضبط دون تسجيل أي شيء
    if (body.preview) return ok(detail);

    if (emp.settlements && emp.settlements.length) throw new HttpError(400, 'يوجد تسوية سابقة لهذا الموظف — عدّلها بدلًا من إنشاء جديدة');

    const deathDate = reason === 'deceased' && body.deathDate
      ? new Date(String(body.deathDate)) : (reason === 'deceased' ? departureDate : null);

    const [settlement] = await db.$transaction([
      db.departureSettlement.create({
        data: {
          employeeId, departureDate, reason,
          hireDate: emp.hireDate, lastWage: detail.lastWage, eosBasis: detail.eosBasis,
          yearsServed: detail.yearsServed, indemnityFull: detail.indemnityFull,
          reasonFactor: detail.servicePercent / 100, eosAmount: detail.eosAmount,
          leaveAllowance: detail.leaveAllowance, otherDues: detail.otherDues,
          deductions: detail.deductions, totalDue: detail.totalDue,
          vacationDays: detail.vacationDays,
          stbHousing: detail.stbHousing, stbSocial: detail.stbSocial,
          stbProvident: detail.stbProvident, stbInsurance: detail.stbInsurance,
          daysPaid: detail.daysPaid, worthSalary: detail.worthSalary,
          loanDeduction: detail.loanDeduction, custodyDeduction: detail.custodyDeduction,
          slices: JSON.stringify(detail.slices),
          paidAmount: Number(body.paidAmount) || 0,
          status: 'pending', notes: body.notes ? String(body.notes) : null,
        },
        include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
      }),
      db.employee.update({
        where: { id: employeeId },
        data: {
          status: reason === 'deceased' ? 'deceased' : 'terminated',
          departureDate, departureReason: reason, deathDate,
        },
      }),
    ]);

    // ضبط حالة الدفع حسب المبلغ المدفوع الأولي
    const status = settlement.paidAmount > 0
      ? (settlement.paidAmount + 0.0005 >= settlement.totalDue ? 'paid' : 'partial')
      : 'pending';
    const final = status !== settlement.status
      ? await db.departureSettlement.update({
          where: { id: settlement.id },
          data: { status, paidAt: status === 'paid' ? new Date() : null },
          include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
        })
      : settlement;

    await logAudit({
      userId: user.id, action: 'create', entity: 'settlement', entityId: settlement.id,
      changes: { after: final }, description: `تسوية مستحقات ${emp.name} (${emp.code}) — سبب: ${reason} — الإجمالي ${detail.totalDue} د.ك`,
    });
    await createRestorePoint(user.id, `تسوية نهاية خدمة: ${emp.name}`).catch(() => {});
    return ok(final, 201);
  });
}
