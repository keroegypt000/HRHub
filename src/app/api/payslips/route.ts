import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle } from '@/lib/api';
import { tafqitKWD } from '@/lib/tafqit';

/** قسائم الرواتب — فلترة بالفترة أو الموظف */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'payslips');
    const url = new URL(req.url);
    const periodId = url.searchParams.get('periodId');
    const employeeId = url.searchParams.get('employeeId');
    const where: Record<string, unknown> = {};
    if (periodId) where.periodId = periodId;
    if (employeeId) where.employeeId = employeeId;
    const rows = await db.payslip.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, code: true, department: true, bankAccount: true } },
        period: true,
        items: { orderBy: { id: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const decorated = rows.map((r) => ({ ...r, netPayTafqit: tafqitKWD(r.netPay) }));
    return ok({ rows: decorated });
  });
}
