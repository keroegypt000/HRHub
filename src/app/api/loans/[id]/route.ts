import { NextRequest } from 'next/server';
import { requireWrite, handle, ok, HttpError } from '@/lib/api';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { db } from '@/lib/db';
import { round3 } from '@/lib/calc';
import { cfg } from '../route';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'loans');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

/** تسجيل سداد أقساط (pay) أو إلغاء (cancel) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireWrite(req, 'loans');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string; installments?: number };
    const loan = await db.loan.findUnique({ where: { id } });
    if (!loan) throw new HttpError(404, 'القرض غير موجود');

    if (body.action === 'cancel') {
      const updated = await db.loan.update({ where: { id }, data: { status: 'cancelled' } });
      return ok(updated);
    }
    if (body.action === 'pay') {
      const n = Math.max(1, Math.min(Number(body.installments) || 1, loan.installmentsCount - loan.paidInstallments));
      const amount = round3(n * loan.monthlyDeduction);
      const paidInstallments = Math.min(loan.installmentsCount, loan.paidInstallments + n);
      const paidAmount = round3(Math.min(loan.totalAmount, loan.paidAmount + amount));
      const status = paidInstallments >= loan.installmentsCount ? 'completed' : 'active';
      const updated = await db.loan.update({ where: { id }, data: { paidInstallments, paidAmount, status } });
      return ok(updated);
    }
    throw new HttpError(400, 'إجراء غير معروف — استخدم pay أو cancel');
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'loans');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
