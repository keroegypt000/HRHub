// /api/ess/approvals — الطلبات التي تنتظر قرار المستخدم الحالي (المستوى الحالي مسند له)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/api';
import { parseSteps, currentPendingStep } from '@/lib/requests';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const pending = await db.employeeRequest.findMany({
      where: { status: 'pending', steps: { contains: user.id } },
      include: { employee: { select: { name: true, code: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const rows = pending.filter((r) => {
      const steps = parseSteps(r.steps);
      const idx = currentPendingStep(steps);
      return idx >= 0 && steps[idx].userId === user.id;
    });
    return ok({ rows });
  });
}
