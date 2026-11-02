import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3, num } from '@/lib/calc';
import { recalcPayslipTotals } from '@/lib/payroll';

/** إضافة بند يدوي على قسيمة (بونص/سلفة/خصم خاص...) — محاسب أو مدير، قبل اعتماد الفترة */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payslips');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string; type?: string; amount?: number; note?: string;
    };
    const slip = await db.payslip.findUnique({ where: { id }, include: { period: true, employee: true } });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    if (slip.period.status === 'approved' || slip.period.status === 'paid') {
      return fail(400, 'القسيمة في فترة معتمدة/مصروفة — اطلب من المدير «إعادة فتح» الفترة أولًا');
    }

    const name = String(body.name || '').trim();
    const type = body.type === 'deduction' ? 'deduction' : 'earning';
    const amount = round3(num(body.amount));
    if (!name) return fail(400, 'اسم البند مطلوب');
    if (!(amount > 0)) return fail(400, 'المبلغ يجب أن يكون أكبر من صفر');

    const item = await db.payslipItem.create({
      data: {
        payslipId: id,
        name,
        type,
        amount,
        note: body.note?.trim() || `بند يدوي — ${user.name}`,
        source: 'manual',
        editedBy: user.name,
        editedAt: new Date(),
      },
    });
    await recalcPayslipTotals(id);

    const updated = await db.payslip.findUnique({ where: { id }, include: { items: true } });
    await logAudit({
      userId: user.id, action: 'update', entity: 'payslip', entityId: id,
      description: `إضافة بند يدوي «${name}» (${type === 'earning' ? 'مكمل' : 'استقطاع'}) بقيمة ${amount.toFixed(3)} د.ك لقسيمة ${slip.employee.name}`,
    });
    return ok(updated);
  });
}
