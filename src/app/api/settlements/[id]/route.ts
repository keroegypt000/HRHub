import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, handle, ok, HttpError } from '@/lib/api';
import { calcEos, settlementStatus, DEPARTURE_REASONS } from '@/lib/indemnity';
import { logAudit } from '@/lib/audit';

const INCLUDE = { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } };

/** تعديل التسوية — يعيد الحساب تلقائيًا */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'settlements');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const st = await db.departureSettlement.findUnique({ where: { id }, include: { employee: true } });
    if (!st) throw new HttpError(404, 'التسوية غير موجودة');

    const reason = body.reason ? String(body.reason) : st.reason;
    if (!DEPARTURE_REASONS.some((r) => r.value === reason)) throw new HttpError(400, 'سبب نهاية الخدمة غير صحيح');
    const departureDate = body.departureDate ? new Date(String(body.departureDate)) : st.departureDate;
    const lastWage = body.lastWage !== undefined && body.lastWage !== null && String(body.lastWage) !== ''
      ? Number(body.lastWage) : st.lastWage;
    const hireDate = body.hireDate ? new Date(String(body.hireDate)) : st.hireDate;

    const calc = calcEos({
      hireDate, endDate: departureDate, lastWage, reason,
      leaveAllowance: body.leaveAllowance !== undefined ? Number(body.leaveAllowance) || 0 : st.leaveAllowance,
      otherDues: body.otherDues !== undefined ? Number(body.otherDues) || 0 : st.otherDues,
      deductions: body.deductions !== undefined ? Number(body.deductions) || 0 : st.deductions,
    });

    const paidAmount = body.paidAmount !== undefined ? Math.max(0, Number(body.paidAmount) || 0) : st.paidAmount;
    const status = settlementStatus(calc.totalDue, paidAmount);

    const [updated] = await db.$transaction([
      db.departureSettlement.update({
        where: { id },
        data: {
          departureDate, reason, hireDate, lastWage,
          yearsServed: calc.years, indemnityFull: calc.indemnityFull,
          reasonFactor: calc.factor, eosAmount: calc.eosAmount,
          leaveAllowance: calc.leaveAllowance, otherDues: calc.otherDues,
          deductions: calc.deductions, totalDue: calc.totalDue,
          paidAmount, status,
          paidAt: status === 'paid' ? (st.paidAt || new Date()) : null,
          notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : st.notes,
        },
        include: INCLUDE,
      }),
      db.employee.update({
        where: { id: st.employeeId },
        data: {
          status: reason === 'deceased' ? 'deceased' : 'terminated',
          departureDate, departureReason: reason,
          deathDate: reason === 'deceased' ? (st.employee.deathDate || departureDate) : null,
        },
      }),
    ]);

    await logAudit({
      userId: user.id, action: 'update', entity: 'settlement', entityId: id,
      description: `تعديل تسوية ${st.employee.name} — الإجمالي ${calc.totalDue} د.ك / المدفوع ${paidAmount} د.ك`,
    });
    return ok(updated);
  });
}

/** تسجيل دفعة على التسوية */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'settlements');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { amount?: number; notes?: string };

    const st = await db.departureSettlement.findUnique({ where: { id }, include: { employee: true } });
    if (!st) throw new HttpError(404, 'التسوية غير موجودة');

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'أدخل مبلغ الدفعة (أكبر من صفر)');
    const paidAmount = Math.round((st.paidAmount + amount) * 1000) / 1000;
    const status = settlementStatus(st.totalDue, paidAmount);

    const updated = await db.departureSettlement.update({
      where: { id },
      data: {
        paidAmount, status,
        paidAt: status === 'paid' ? (st.paidAt || new Date()) : st.paidAt,
        notes: body.notes ? `${st.notes ? st.notes + ' | ' : ''}دفعة ${new Date().toISOString().slice(0, 10)}: ${amount} د.ك — ${body.notes}` : st.notes,
      },
      include: INCLUDE,
    });

    await logAudit({
      userId: user.id, action: 'pay', entity: 'settlement', entityId: id,
      description: `دفعة مستحقات ${st.employee.name}: ${amount} د.ك — المتبقي ${Math.max(0, Math.round((st.totalDue - paidAmount) * 1000) / 1000)} د.ك`,
    });
    return ok(updated);
  });
}

/** حذف التسوية — يعيد الموظف لحالة نشط */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'settlements');
    const { id } = await ctx.params;
    const st = await db.departureSettlement.findUnique({ where: { id }, include: { employee: true } });
    if (!st) throw new HttpError(404, 'التسوية غير موجودة');

    await db.$transaction([
      db.departureSettlement.delete({ where: { id } }),
      db.employee.update({
        where: { id: st.employeeId },
        data: { status: 'active', departureDate: null, departureReason: null, deathDate: null },
      }),
    ]);

    await logAudit({
      userId: user.id, action: 'delete', entity: 'settlement', entityId: id,
      description: `حذف تسوية ${st.employee.name} — أُعيد الموظف لحالة نشط`,
    });
    return ok({ deleted: true });
  });
}
