import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3, num } from '@/lib/calc';
import { recalcPayslipTotals } from '@/lib/payroll';

/** تعديل بند في القسيمة — يتصرف كبند يدوي محفوظ بعد إعادة الحساب */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payslips');
    const { id, itemId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string; type?: string; amount?: number; note?: string;
    };
    const slip = await db.payslip.findUnique({ where: { id }, include: { period: true, employee: true } });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    if (slip.period.status === 'approved' || slip.period.status === 'paid') {
      return fail(400, 'القسيمة في فترة معتمدة/مصروفة — اطلب من المدير «إعادة فتح» الفترة أولًا');
    }
    const item = await db.payslipItem.findUnique({ where: { id: itemId } });
    if (!item || item.payslipId !== id) return fail(404, 'البند غير موجود');

    const newName = body.name !== undefined ? String(body.name).trim() : item.name;
    if (!newName) return fail(400, 'اسم البند مطلوب');
    const newType = body.type === 'deduction' ? 'deduction' : body.type === 'earning' ? 'earning' : item.type;
    const newAmount = body.amount !== undefined ? round3(num(body.amount)) : item.amount;
    if (!(newAmount >= 0)) return fail(400, 'المبلغ غير صالح');

    await db.payslipItem.update({
      where: { id: itemId },
      data: {
        name: newName,
        type: newType,
        amount: newAmount,
        note: body.note !== undefined ? (body.note?.trim() || null) : item.note,
        source: 'manual',
        editedBy: user.name,
        editedAt: new Date(),
      },
    });
    await recalcPayslipTotals(id);

    const updated = await db.payslip.findUnique({ where: { id }, include: { items: true } });
    await logAudit({
      userId: user.id, action: 'update', entity: 'payslip', entityId: id,
      description: `تعديل بند «${newName}» في قسيمة ${slip.employee.name} — القيمة ${newAmount.toFixed(3)} د.ك (بواسطة ${user.name})`,
    });
    return ok(updated);
  });
}

/** حذف بند من القسيمة (يدوي أو محسوب) — يعاد الإجمالي بعده */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payslips');
    const { id, itemId } = await ctx.params;
    const slip = await db.payslip.findUnique({ where: { id }, include: { period: true, employee: true } });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    if (slip.period.status === 'approved' || slip.period.status === 'paid') {
      return fail(400, 'القسيمة في فترة معتمدة/مصروفة — اطلب من المدير «إعادة فتح» الفترة أولًا');
    }
    const item = await db.payslipItem.findUnique({ where: { id: itemId } });
    if (!item || item.payslipId !== id) return fail(404, 'البند غير موجود');

    await db.payslipItem.delete({ where: { id: itemId } });
    await recalcPayslipTotals(id);

    const updated = await db.payslip.findUnique({ where: { id }, include: { items: true } });
    await logAudit({
      userId: user.id, action: 'delete', entity: 'payslip', entityId: id,
      description: `حذف بند «${item.name}» (${item.amount.toFixed(3)} د.ك) من قسيمة ${slip.employee.name}`,
    });
    return ok(updated);
  });
}
