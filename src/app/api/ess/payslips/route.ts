// /api/ess/payslips — قسائم الموظف المنشورة (فترات معتمدة/مصروفة فقط)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requireEmployee, RELEASED_PERIOD_STATUSES } from '@/lib/ess';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { employeeId } = await requireEmployee(req);
    const rows = await db.payslip.findMany({
      where: { employeeId, period: { status: { in: RELEASED_PERIOD_STATUSES } } },
      select: {
        id: true, netPay: true, totalEarnings: true, totalDeductions: true,
        period: { select: { name: true, status: true } },
      },
      orderBy: { period: { startDate: 'desc' } },
      take: 36,
    });
    return ok({ rows });
  });
}
