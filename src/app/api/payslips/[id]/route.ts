import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3 } from '@/lib/calc';
import { tafqitKWD } from '@/lib/tafqit';

/** قسيمة واحدة مع التفقيط */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'payslips');
    const { id } = await ctx.params;
    const slip = await db.payslip.findUnique({
      where: { id },
      include: {
        employee: { include: { department: true, position: true } },
        period: true,
        items: true,
      },
    });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    return ok({ ...slip, netPayTafqit: tafqitKWD(slip.netPay) });
  });
}

/** تعديل بنود يدوية (manual) في فترة draft فقط — مثل السلف */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payslips');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      manualItems?: { name: string; type: 'earning' | 'deduction'; amount: number; note?: string }[];
    };
    const slip = await db.payslip.findUnique({ where: { id }, include: { period: true, items: true } });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    if (slip.period.status !== 'draft') {
      return fail(400, 'لا يمكن تعديل قسيمة في فترة معتمدة أو مصروفة');
    }

    // حذف البنود اليدوية القديمة وإضافة الجديدة
    await db.payslipItem.deleteMany({ where: { payslipId: id, componentId: null, name: { contains: 'يدوي' } } });
    for (const item of body.manualItems || []) {
      await db.payslipItem.create({
        data: {
          payslipId: id,
          name: item.name.includes('يدوي') ? item.name : `${item.name} (يدوي)`,
          type: item.type,
          amount: round3(item.amount),
          note: item.note || null,
        },
      });
    }

    // إعادة الإجماليات
    const items = await db.payslipItem.findMany({ where: { payslipId: id } });
    const totalEarnings = round3(items.filter((i) => i.type === 'earning').reduce((s, i) => s + i.amount, 0));
    const totalDeductions = round3(items.filter((i) => i.type === 'deduction').reduce((s, i) => s + i.amount, 0));
    const netPay = round3(totalEarnings - totalDeductions);
    const updated = await db.payslip.update({
      where: { id },
      data: { totalEarnings, totalDeductions, netPay },
      include: { items: true, employee: true, period: true },
    });
    await logAudit({
      userId: user.id, action: 'update', entity: 'payslip', entityId: id,
      description: `تعديل بنود يدوية لقسيمة ${updated.employee.name} — الصافي ${netPay.toFixed(3)} د.ك`,
    });
    return ok(updated);
  });
}
