import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle } from '@/lib/api';
import { dateKey, kuwaitMidnight, monthDayKeys, weekdayIndex, fmtTime } from '@/lib/time';
import { contractAlerts, refreshContractStatuses } from '@/lib/contracts';

const STATUS_AR: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', half_day: 'نص يوم', absent: 'غائب',
  leave: 'في إجازة', holiday: 'عطلة رسمية', weekend: 'راحة أسبوعية', missed_punch: 'بصمة ناقصة',
};

/** بيانات لوحة التحكم: KPIs + آخر 10 سجلات حية + اتجاه 30 يومًا + تنبيهات */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'dashboard');
    await refreshContractStatuses().catch(() => {});

    const today = dateKey();
    const { from, to } = (() => { const r = { from: kuwaitMidnight(today), to: new Date(kuwaitMidnight(today).getTime() + 86400_000) }; return r; })();

    const activeEmployees = await db.employee.count({ where: { status: 'active' } });
    const todayRows = await db.dailyAttendance.findMany({
      where: { date: { gte: from, lt: to } },
      select: { status: true, employeeId: true },
    });

    const counts = {
      present: 0, late: 0, absent: 0, leave: 0, half_day: 0, missed_punch: 0,
      holiday: 0, weekend: 0,
    };
    for (const row of todayRows) counts[row.status] = (counts[row.status] || 0) + 1;

    // الأجهزة المتصلة (ظهرت خلال 90 ثانية) والمنقطعة >10 دقائق
    const devices = await db.device.findMany({ where: { enabled: true } });
    const now = Date.now();
    const devicesOnline = devices.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < 90_000).length;
    const devicesOfflineAlert = devices
      .filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() > 10 * 60_000 && d.lastSeenAt.getTime() > now - 24 * 3600_000)
      .map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt }));

    // آخر 10 سجلات حية
    const latestLogs = await db.attendanceLog.findMany({
      include: {
        employee: { select: { name: true, code: true, photoId: true } },
        device: { select: { name: true } },
      },
      orderBy: { punchTime: 'desc' },
      take: 10,
    });

    // اتجاه الحضور لآخر 30 يومًا (حاضر/متأخر منفصلان)
    const keys = monthDayKeys(today.slice(0, 7));
    const recentKeys: string[] = [];
    const nowKey = today;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(kuwaitMidnight(nowKey).getTime() - i * 86400_000);
      recentKeys.push(dateKey(d));
    }
    const monthStart = recentKeys[0];
    const monthEnd = recentKeys[recentKeys.length - 1];
    const trendRows = await db.dailyAttendance.groupBy({
      by: ['date', 'status'],
      where: { date: { gte: kuwaitMidnight(monthStart), lte: kuwaitMidnight(monthEnd) }, status: { in: ['present', 'late', 'absent'] } },
      _count: true,
    });
    const trendMap = new Map<string, { present: number; late: number; absent: number }>();
    for (const t of trendRows) {
      const key = dateKey(t.date);
      const entry = trendMap.get(key) || { present: 0, late: 0, absent: 0 };
      if (t.status === 'present') entry.present += t._count;
      if (t.status === 'late') entry.late += t._count;
      if (t.status === 'absent') entry.absent += t._count;
      trendMap.set(key, entry);
    }
    const trend = recentKeys.map((k) => ({ date: k, ...(trendMap.get(k) || { present: 0, late: 0, absent: 0 }) }));

    const alerts = await contractAlerts();
    const pendingLeaves = await db.leaveRequest.count({ where: { status: 'pending' } });

    return ok({
      kpis: {
        activeEmployees,
        present: counts.present + counts.late + counts.half_day,
        late: counts.late,
        absent: counts.absent,
        onLeave: counts.leave,
        missedPunch: counts.missed_punch,
        devicesOnline,
        devicesTotal: devices.length,
        pendingLeaves,
      },
      latestLogs: latestLogs.map((l) => ({
        id: l.id,
        time: fmtTime(l.punchTime),
        date: dateKey(l.punchTime),
        employeeName: l.employee?.name || null,
        employeeCode: l.employee?.code || null,
        photoId: l.employee?.photoId || null,
        pin: l.pin,
        deviceName: l.device?.name || l.sn,
        source: l.source,
      })),
      trend,
      alerts,
      devicesOfflineAlert,
      isNewDevice: devices.some((d) => d.name.startsWith('جهاز جديد')),
    });
  });
}
