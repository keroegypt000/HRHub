// /api/ess/payslips/[id] — تفاصيل قسيمة واحدة للموظف صاحبها فقط
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok, HttpError } from '@/lib/api';
import { requireEmployee, RELEASED_PERIOD_STATUSES } from '@/lib/ess';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { employeeId } = await requireEmployee(req);
    const { id } = await ctx.params;
    const slip = await db.payslip.findFirst({
      where: { id, employeeId, period: { status: { in: RELEASED_PERIOD_STATUSES } } },
      include: {
        items: { select: { name: true, type: true, amount: true, note: true } },
        period: { select: { name: true, startDate: true, endDate: true } },
        employee: {
          select: {
            name: true, code: true, bankAccount: true, nationality: true, civilId: true,
            department: { select: { name: true } }, position: { select: { name: true } },
          },
        },
      },
    });
    if (!slip) throw new HttpError(404, 'القسيمة غير موجودة');
    return ok(slip);
  });
}
