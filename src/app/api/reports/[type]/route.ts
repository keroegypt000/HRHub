import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, ok, handle, HttpError } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { kuwaitMidnight, monthDayKeys, dateKey, weekdayIndex, hmToMinutes, fmtTime } from '@/lib/time';

const STATUS_AR: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', half_day: 'نص يوم', absent: 'غائب',
  leave: 'في إجازة', holiday: 'عطلة رسمية', weekend: 'راحة أسبوعية', missed_punch: 'بصمة ناقصة',
};

/**
 * التقارير الستة: daily | monthly | late | overtime | absence | leaves
 * كلها بفلاتر (من/إلى/قسم/موظف) وقابلة للتصدير من الواجهة.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  return handle(async () => {
    const user = await requireRead(req, 'reports');
    const { type } = await ctx.params;
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const departmentId = url.searchParams.get('departmentId');
    const employeeId = url.searchParams.get('employeeId');

    const dateWhere: Record<string, unknown> = {};
    if (from) dateWhere.gte = kuwaitMidnight(from);
    if (to) dateWhere.lte = kuwaitMidnight(to);
    const empWhere: Record<string, unknown> = {};
    if (departmentId && departmentId !== 'all') empWhere.departmentId = departmentId;
    if (employeeId && employeeId !== 'all') empWhere.id = employeeId;
    const where: Record<string, unknown> = {};
    if (from || to) where.date = dateWhere;
    if (Object.keys(empWhere).length) where.employee = empWhere;

    const settings = await getSettings();
    const workDaysPerMonth = settings.workDaysPerMonth;

    switch (type) {
      // ===== 1. تقرير الحضور اليومي =====
      case 'daily': {
        const rows = await db.dailyAttendance.findMany({
          where,
          include: { employee: { select: { name: true, code: true, department: true, position: true } }, shift: true },
          orderBy: [{ date: 'desc' }, { employee: { name: 'asc' } }],
          take: 3000,
        });
        return ok({
          columns: ['التاريخ', 'الموظف', 'الرقم', 'القسم', 'الوردية', 'الحالة', 'الدخول', 'الخروج', 'دقائق العمل', 'تأخير', 'مبكر', 'إضافي'],
          rows: rows.map((r) => [
            dateKey(r.date), r.employee.name, r.employee.code, r.employee.department?.name || '—',
            r.shift?.name || '—', STATUS_AR[r.status] || r.status,
            fmtTime(r.firstIn), fmtTime(r.lastOut), r.workedMinutes,
            r.lateMinutes, r.earlyMinutes, r.otMinutes,
          ]),
        });
      }

      // ===== 2. الملخص الشهري لكل موظف =====
      case 'monthly': {
        const employees = await db.employee.findMany({
          where: Object.keys(empWhere).length ? empWhere : { status: { not: 'terminated' } },
          include: { department: true },
        });
        const keys = (from && to) ? monthDayKeys(dateKey(kuwaitMidnight(from)).slice(0, 7)) : monthDayKeys(dateKey().slice(0, 7));
        const startKey = from ? dateKey(kuwaitMidnight(from)) : keys[0];
        const endKey = to ? dateKey(kuwaitMidnight(to)) : keys[keys.length - 1];
        const periodKeys = keys.filter((k) => k >= startKey && k <= endKey);
        const daily = await db.dailyAttendance.findMany({
          where: { date: { gte: kuwaitMidnight(startKey), lte: kuwaitMidnight(endKey) } },
        });
        const byEmp = new Map<string, typeof daily>();
        for (const d of daily) {
          const arr = byEmp.get(d.employeeId) || [];
          arr.push(d);
          byEmp.set(d.employeeId, arr);
        }
        const summary = employees.map((e) => {
          const rows = byEmp.get(e.id) || [];
          const c: Record<string, number> = {};
          for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
          const lateMinutes = rows.reduce((s, r) => s + r.lateMinutes, 0);
          const otMinutes = rows.reduce((s, r) => s + r.otMinutes, 0);
          const workedMinutes = rows.reduce((s, r) => s + r.workedMinutes, 0);
          return [
            e.name, e.code, e.department?.name || '—',
            (c.present || 0) + (c.late || 0) + (c.half_day || 0),
            c.late || 0, c.absent || 0, c.leave || 0, c.holiday || 0, c.weekend || 0, c.missed_punch || 0,
            Math.round((lateMinutes / 60) * 10) / 10,
            Math.round((otMinutes / 60) * 10) / 10,
            Math.round((workedMinutes / 60) * 10) / 10,
            `${Math.round(((periodKeys.length) / workDaysPerMonth) * 100)}%`,
          ];
        });
        return ok({
          columns: ['الموظف', 'الرقم', 'القسم', 'أيام حضور', 'تأخير (يوم)', 'غياب', 'إجازة', 'عطلة', 'راحة', 'بصمة ناقصة', 'ساعات تأخير', 'ساعات إضافي', 'ساعات عمل', 'نسبة الدوام'],
          rows: summary,
          period: `${startKey} → ${endKey}`,
        });
      }

      // ===== 3. التأخير والخروج المبكر =====
      case 'late': {
        const rows = await db.dailyAttendance.findMany({
          where: { ...where, status: { in: ['late', 'present', 'half_day'] } },
          include: { employee: { select: { name: true, code: true, department: true } } },
          orderBy: [{ date: 'desc' }],
          take: 3000,
        });
        const filtered = rows.filter((r) => r.lateMinutes > 0 || r.earlyMinutes > 0);
        return ok({
          columns: ['التاريخ', 'الموظف', 'الرقم', 'القسم', 'دقائق التأخير', 'دقائق الخروج المبكر', 'الدخول', 'الخروج'],
          rows: filtered.map((r) => [
            dateKey(r.date), r.employee.name, r.employee.code, r.employee.department?.name || '—',
            r.lateMinutes, r.earlyMinutes, fmtTime(r.firstIn), fmtTime(r.lastOut),
          ]),
        });
      }

      // ===== 4. العمل الإضافي =====
      case 'overtime': {
        const rows = await db.dailyAttendance.findMany({
          where: { ...where, otMinutes: { gt: 0 } },
          include: { employee: { select: { name: true, code: true, department: true, basicSalary: true } } },
          orderBy: [{ date: 'desc' }],
          take: 3000,
        });
        const { hourRate } = await import('@/lib/calc');
        return ok({
          columns: ['التاريخ', 'الموظف', 'الرقم', 'القسم', 'ساعات إضافي', 'أجر الساعة', 'قيمة مقترحة (×1.25)'],
          rows: rows.map((r) => {
            const hr = hourRate(r.employee.basicSalary, settings);
            return [
              dateKey(r.date), r.employee.name, r.employee.code, r.employee.department?.name || '—',
              Math.round((r.otMinutes / 60) * 100) / 100, hr,
              Math.round(hr * 1.25 * (r.otMinutes / 60) * 1000) / 1000,
            ];
          }),
        });
      }

      // ===== 5. الغياب =====
      case 'absence': {
        const rows = await db.dailyAttendance.findMany({
          where: { ...where, status: { in: ['absent', 'missed_punch'] } },
          include: { employee: { select: { name: true, code: true, department: true } } },
          orderBy: [{ date: 'desc' }],
          take: 3000,
        });
        return ok({
          columns: ['التاريخ', 'الموظف', 'الرقم', 'القسم', 'الحالة', 'يوم الأسبوع'],
          rows: rows.map((r) => [
            dateKey(r.date), r.employee.name, r.employee.code, r.employee.department?.name || '—',
            STATUS_AR[r.status] || r.status,
            ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][weekdayIndex(kuwaitMidnight(dateKey(r.date)))],
          ]),
        });
      }

      // ===== 6. رصيد الإجازات =====
      case 'leaves': {
        const employees = await db.employee.findMany({
          where: Object.keys(empWhere).length ? empWhere : { status: { not: 'terminated' } },
          include: { department: true },
        });
        const types = await db.leaveType.findMany({ where: { active: true } });
        const approved = await db.leaveRequest.findMany({
          where: { status: 'approved', ...(Object.keys(empWhere).length ? { employee: empWhere } : {}) },
          include: { leaveType: true },
        });
        const rows = employees.map((e) => {
          const mine = approved.filter((a) => a.employeeId === e.id);
          const balances = types.map((t) => {
            const used = mine.filter((m) => m.leaveTypeId === t.id).reduce((s, m) => s + Number(m.days), 0);
            const quota = t.quotaDays ?? '—';
            return `${t.name}: ${used}/${quota}`;
          });
          return [
            e.name, e.code, e.department?.name || '—',
            mine.reduce((s, m) => s + Number(m.days), 0),
            mine.filter((m) => m.leaveType.paid).reduce((s, m) => s + Number(m.days), 0),
            mine.filter((m) => !m.leaveType.paid).reduce((s, m) => s + Number(m.days), 0),
            balances.join(' | '),
          ];
        });
        return ok({
          columns: ['الموظف', 'الرقم', 'القسم', 'إجمالي الأيام', 'مدفوعة', 'غير مدفوعة', 'الأرصدة التفصيلية'],
          rows,
        });
      }

      default:
        throw new HttpError(404, 'تقرير غير معروف — النوع: daily|monthly|late|overtime|absence|leaves');
    }
  });
}
