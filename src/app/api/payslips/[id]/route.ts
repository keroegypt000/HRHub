import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3 } from '@/lib/calc';
import { recalcPayslipTotals } from '@/lib/payroll';
import { tafqitKWD } from '@/lib/tafqit';

/** هل الفترة قابلة للتعديل؟ (قبل الاعتماد) */
async function editableSlip(id: string) {
  const slip = await db.payslip.findUnique({ where: { id }, include: { period: true } });
  if (!slip) return { error: fail(404, 'القسيمة غير موجودة') };
  if (slip.period.status === 'approved' || slip.period.status === 'paid') {
    return { error: fail(400, 'القسيمة في فترة معتمدة/مصروفة — اطلب من المدير «إعادة فتح» الفترة أولًا') };
  }
  return { slip };
}

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

/** استبدال كل البنود اليدوية دفعة واحدة (فترة draft/computed فقط) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payslips');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      manualItems?: { name: string; type: 'earning' | 'deduction'; amount: number; note?: string }[];
    };
    const found = await editableSlip(id);
    if ('error' in found) return found.error;
    const slip = found.slip;

    await db.payslipItem.deleteMany({ where: { payslipId: id, source: 'manual' } });
    for (const item of body.manualItems || []) {
      if (!item.name?.trim()) continue;
      await db.payslipItem.create({
        data: {
          payslipId: id,
          name: item.name.trim(),
          type: item.type,
          amount: round3(item.amount),
          note: item.note || null,
          source: 'manual',
          editedBy: user.name,
          editedAt: new Date(),
        },
      });
    }

    await recalcPayslipTotals(id);
    const updated = await db.payslip.findUnique({
      where: { id },
      include: { items: true, employee: true, period: true },
    });
    await logAudit({
      userId: user.id, action: 'update', entity: 'payslip', entityId: id,
      description: `تعديل بنود يدوية لقسيمة ${updated?.employee?.name || ''} (${(body.manualItems || []).length} بند)`,
    });
    return ok(updated);
  });
}
