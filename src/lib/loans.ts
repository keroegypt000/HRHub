// lib/loans.ts — ترحيل أقساط السلف عند صرف الرواتب (وعكسها عند إعادة فتح فترة مصروفة)
// بدونه يبقى القرض «نشطًا» ويُخصم نفس القسط كل شهر بلا نهاية
import type { Prisma } from '@prisma/client';
import { round3 } from '@/lib/calc';

/** direction = 1 عند الصرف، −1 عند إعادة فتح فترة مصروفة */
export async function postLoanInstallments(tx: Prisma.TransactionClient, periodId: string, direction: 1 | -1): Promise<number> {
  const items = await tx.payslipItem.findMany({
    where: { payslip: { periodId }, loanId: { not: null }, type: 'deduction' },
  });
  for (const it of items) {
    const loan = await tx.loan.findUnique({ where: { id: it.loanId! } });
    if (!loan) continue;
    const paidInstallments = Math.max(0, Math.min(loan.installmentsCount, loan.paidInstallments + direction));
    const paidAmount = Math.max(0, Math.min(loan.totalAmount, round3(loan.paidAmount + direction * it.amount)));
    const done = paidInstallments >= loan.installmentsCount || paidAmount + 0.0005 >= loan.totalAmount;
    await tx.loan.update({
      where: { id: loan.id },
      data: { paidInstallments, paidAmount, status: loan.status === 'cancelled' ? 'cancelled' : done ? 'completed' : 'active' },
    });
  }
  return items.length;
}
