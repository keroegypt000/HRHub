// /api/ess/attendance?month=YYYY-MM — حضور الموظف اليومي لشهر
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requireEmployee } from '@/lib/ess';
import { dateKey, daysInMonth, kuwaitMidnight } from '@/lib/time';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { employeeId } = await requireEmployee(req);
    const m = new URL(req.url).searchParams.get('month');
    const month = m && /^\d{4}-\d{2}$/.test(m) ? m : dateKey().slice(0, 7);
    const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const rows = await db.dailyAttendance.findMany({
      where: { employeeId, date: { gte: kuwaitMidnight(`${month}-01`), lte: kuwaitMidnight(lastDay) } },
      select: { date: true, firstIn: true, lastOut: true, workedMinutes: true, lateMinutes: true, otMinutes: true, status: true, note: true },
      orderBy: { date: 'asc' },
    });
    return ok({ month, rows });
  });
}
