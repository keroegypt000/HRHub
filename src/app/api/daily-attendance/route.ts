import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle } from '@/lib/api';
import { kuwaitMidnight } from '@/lib/time';

export const STATUS_AR_MAP: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', half_day: 'نص يوم', absent: 'غائب',
  leave: 'في إجازة', holiday: 'عطلة رسمية', weekend: 'راحة أسبوعية', missed_punch: 'بصمة ناقصة',
};

/** الحضور اليومي المحسوب — فلاتر: فترة، قسم، حالة، موظف */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'daily-attendance');
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const departmentId = url.searchParams.get('departmentId');
    const status = url.searchParams.get('status');
    const employeeId = url.searchParams.get('employeeId');
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1000);

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.date = {
        ...(from ? { gte: kuwaitMidnight(from) } : {}),
        ...(to ? { lte: kuwaitMidnight(to) } : {}),
      };
    }
    if (status && status !== 'all') where.status = status;
    if (employeeId && employeeId !== 'all') where.employeeId = employeeId;
    if (departmentId && departmentId !== 'all') {
      where.employee = { departmentId };
    }

    const [rows, total] = await Promise.all([
      db.dailyAttendance.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, code: true, department: true, position: true } },
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        },
        orderBy: [{ date: 'desc' }, { employee: { name: 'asc' } }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.dailyAttendance.count({ where }),
    ]);

    const decorated = rows.map((r) => ({ ...r, statusAr: STATUS_AR_MAP[r.status] || r.status }));
    return ok({ rows: decorated, total, page, limit, statusMap: STATUS_AR_MAP });
  });
}
