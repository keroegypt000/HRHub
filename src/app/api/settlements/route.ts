import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok, HttpError } from '@/lib/api';
import { crudList, CrudConfig } from '@/lib/crud';
import { calcEos, DEPARTURE_REASONS } from '@/lib/indemnity';
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
    if (emp.settlements && emp.settlements.length) throw new HttpError(400, 'يوجد تسوية سابقة لهذا الموظف — عدّلها بدلًا من إنشاء جديدة');

    // آخر أجر: من الطلب أو من آخر عقد نشط (أساسي + سكن + مواصلات) أو الراتب الأساسي
    const contractWage = emp.contracts[0]
      ? emp.contracts[0].basicSalary + emp.contracts[0].housingAllowance + emp.contracts[0].transportAllowance
      : emp.basicSalary;
    const lastWage = body.lastWage !== undefined && body.lastWage !== null && String(body.lastWage) !== ''
      ? Number(body.lastWage) : contractWage;

    const calc = calcEos({
      hireDate: body.hireDate ? new Date(String(body.hireDate)) : emp.hireDate,
      endDate: departureDate,
      lastWage,
      reason,
      leaveAllowance: Number(body.leaveAllowance) || 0,
      otherDues: Number(body.otherDues) || 0,
      deductions: Number(body.deductions) || 0,
    });

    // التفاصيل الكاملة (شرائح بالأيام + تعويض إجازات تلقائي + قروض + كشف المرتب)
    const detail = await buildSettlementDetail({
      employeeId,
      hireDate: body.hireDate ? new Date(String(body.hireDate)) : emp.hireDate,
      departureDate,
      reason,
      lastWage,
      leaveAllowance: body.leaveAllowance,
      otherDues: body.otherDues,
      deductions: body.deductions,
    });

    const deathDate = reason === 'deceased' && body.deathDate
      ? new Date(String(body.deathDate)) : (reason === 'deceased' ? departureDate : null);

    const [settlement] = await db.$transaction([
      db.departureSettlement.create({
        data: {
          employeeId, departureDate, reason,
          hireDate: emp.hireDate, lastWage,
          yearsServed: detail.yearsServed, indemnityFull: detail.indemnityFull,
          reasonFactor: detail.servicePercent / 100, eosAmount: Math.round(detail.indemnityFull * (detail.servicePercent / 100) * 1000) / 1000,
          leaveAllowance: detail.leaveAllowance, otherDues: detail.otherDues,
          deductions: detail.deductions, totalDue: detail.totalDue,
          vacationDays: detail.vacationDays,
          stbHousing: detail.stbHousing, stbSocial: detail.stbSocial,
          stbProvident: detail.stbProvident, stbInsurance: detail.stbInsurance,
          daysPaid: detail.daysPaid, worthSalary: detail.worthSalary,
          loanDeduction: detail.loanDeduction,
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
      changes: { after: final }, description: `تسوية مستحقات ${emp.name} (${emp.code}) — سبب: ${reason} — الإجمالي ${calc.totalDue} د.ك`,
    });
    await createRestorePoint(user.id, `تسوية نهاية خدمة: ${emp.name}`).catch(() => {});
    return ok(final, 201);
  });
}
