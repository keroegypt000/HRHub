import { NextRequest } from 'next/server';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { recomputeRange, computeDay } from '@/lib/attendance';
import { logAudit } from '@/lib/audit';
import { dateKey, addDaysKey } from '@/lib/time';

/** إعادة معالجة الحضور لنطاق زمني أو يوم واحد — HR/مدير */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'daily-attendance');
    const body = (await req.json().catch(() => ({}))) as {
      from?: string; to?: string; employeeId?: string; date?: string;
    };

    let from = body.from || body.date || dateKey();
    let to = body.to || body.date || dateKey();
    if (from > to) [from, to] = [to, from];

    const result = body.employeeId
      ? { days: 0, employees: 1 }
      : await recomputeRange({ from, to, employeeId: body.employeeId });

    if (body.employeeId) {
      let cur = from;
      let guard = 0;
      while (cur <= to && guard < 100) {
        await computeDay(body.employeeId, cur);
        cur = addDaysKey(cur, 1);
        guard++;
      }
    }

    await logAudit({
      userId: user.id, action: 'compute', entity: 'daily-attendance',
      description: `إعادة معالجة الحضور من ${from} إلى ${to}${body.employeeId ? ' لموظف محدد' : ''} (${result.days} يوم)`,
    });
    return ok({ recomputed: true, from, to, ...result });
  });
}
