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

      // ===== 7. كشف الوقت الشهري التفصيلي (Total Time Card) — موظف واحد يوم-باليوم =====
      case 'time-card': {
        if (!employeeId || employeeId === 'all') throw new HttpError(400, 'اختر الموظف لكشف الوقت التفصيلي');
        const startKey = from || dateKey(kuwaitMidnight(dateKey().slice(0, 7) + '-01'));
        const endKey = to || dateKey(new Date(new Date(kuwaitMidnight(startKey)).getFullYear(), new Date(kuwaitMidnight(startKey)).getMonth() + 1, 0));
        const emp = await db.employee.findUnique({
          where: { id: employeeId },
          include: { department: { select: { name: true } }, position: { select: { name: true } } },
        });
        if (!emp) throw new HttpError(404, 'الموظف غير موجود');

        const rows = await db.dailyAttendance.findMany({
          where: { employeeId, date: { gte: kuwaitMidnight(startKey), lte: kuwaitMidnight(endKey) } },
          include: { shift: true },
          orderBy: { date: 'asc' },
        });
        const byKey = new Map(rows.map((r) => [dateKey(r.date), r]));

        // الإجازات المعتمدة داخل النطاق (بالساعات لليوم = ساعات الوردية)
        const leaves = await db.leaveRequest.findMany({
          where: {
            employeeId, status: 'approved',
            fromDate: { lte: kuwaitMidnight(endKey) }, toDate: { gte: kuwaitMidnight(startKey) },
          },
          include: { leaveType: true },
        });
        const leaveForKey = (key: string) => leaves.find((l) => dateKey(l.fromDate) <= key && key <= dateKey(l.toDate));

        // العطلات الرسمية
        const holidays = await db.holiday.findMany();
        const isHoliday = (key: string): boolean => {
          const md = key.slice(5);
          for (const h of holidays) {
            const hf = dateKey(h.date);
            const ht = h.endDate ? dateKey(h.endDate) : hf;
            if (key >= hf && key <= ht) return true;
            if (h.recurring) {
              const f = hf.slice(5), t = ht.slice(5);
              if (f <= t ? md >= f && md <= t : md >= f || md <= t) return true;
            }
          }
          return false;
        };

        // أيام عمل الأسبوع لكل يوم (حسب إسناد الوردية)
        const assignments = await db.shiftAssignment.findMany({
          where: { employeeId, fromDate: { lte: kuwaitMidnight(endKey) } },
          orderBy: { fromDate: 'desc' },
        });
        const shiftById = new Map<string, typeof rows[number]['shift']>();
        for (const a of assignments) {
          const s = await db.shift.findUnique({ where: { id: a.shiftId } });
          if (s) shiftById.set(a.shiftId, s);
        }
        const shiftFor = (key: string) => {
          const a = assignments.find((x) => dateKey(x.fromDate) <= key && (!x.toDate || dateKey(x.toDate) >= key));
          return a ? shiftById.get(a.shiftId) || null : null;
        };
        const parseWorkDays = (json: string | null): number[] => {
          try { const arr = JSON.parse(json || '[]'); return Array.isArray(arr) ? arr.map(Number) : [0, 1, 2, 3, 4]; } catch { return [0, 1, 2, 3, 4]; }
        };

        const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
        const wdNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        const out: (string | number)[][] = [];
        const stats = { dutyMin: 0, workedMin: 0, otNormal: 0, otWeekend: 0, otHoliday: 0, lateM: 0, earlyM: 0, absH: 0, leaveH: 0, presentDays: 0 };
        const cur = new Date(kuwaitMidnight(startKey));
        while (dateKey(cur) <= endKey) {
          const key = dateKey(cur);
          const r = byKey.get(key);
          const shift = shiftFor(key);
          const wdays = parseWorkDays(shift?.workDays || null);
          const isWorkday = wdays.includes(weekdayIndex(cur));
          const dutyMin = shift ? Math.max(0, (new Date(`2000-01-01T${shift.endTime}:00`).getTime() - new Date(`2000-01-01T${shift.startTime}:00`).getTime()) / 60000) : 480;
          const lv = leaveForKey(key);

          let status = '—', exception = '';
          let totalHours = 0, workedHours = 0, lateM = 0, earlyM = 0, absH = 0, leaveH = 0, otN = 0, otW = 0, otH = 0;

          if (isHoliday(key)) {
            status = 'عطلة رسمية';
            if (r && r.otMinutes > 0) { otH = r.otMinutes; }
          } else if (!isWorkday) {
            status = 'راحة أسبوعية';
            if (r && r.otMinutes > 0) { otW = r.otMinutes; }
          } else if (lv) {
            status = lv.leaveType.name;
            leaveH = dutyMin;
          } else if (r) {
            if (r.firstIn) totalHours = Math.round((r.lastOut && r.lastOut > r.firstIn ? r.lastOut.getTime() - r.firstIn.getTime() : 0) / 60000);
            workedHours = r.workedMinutes;
            lateM = r.lateMinutes; earlyM = r.earlyMinutes;
            if (r.otMinutes > 0) otN = r.otMinutes;
            switch (r.status) {
              case 'present': status = 'حاضر'; stats.presentDays++; break;
              case 'late': status = 'متأخر'; stats.presentDays++; break;
              case 'half_day': status = 'نص يوم'; stats.presentDays++; absH = dutyMin / 2; break;
              case 'absent': status = 'غائب'; absH = dutyMin; break;
              case 'missed_punch': status = 'بصمة ناقصة'; exception = 'بصمة ناقصة'; break;
              default: status = STATUS_AR[r.status] || r.status;
            }
          } else {
            status = 'غياب'; absH = dutyMin;
          }

          stats.dutyMin += isWorkday && !isHoliday(key) ? dutyMin : 0;
          stats.workedMin += workedHours;
          stats.otNormal += otN; stats.otWeekend += otW; stats.otHoliday += otH;
          stats.lateM += lateM; stats.earlyM += earlyM;
          stats.absH += absH; stats.leaveH += leaveH;

          out.push([
            key, wdNames[weekdayIndex(cur)], shift ? `${shift.startTime} - ${shift.endTime}` : '—',
            fmtTime(r?.firstIn || null), fmtTime(r?.lastOut || null),
            hm(dutyMin), hm(totalHours), hm(workedHours),
            lateM || '—', earlyM || '—', absH ? hm(absH) : '—',
            otN ? hm(otN) : '—', otW ? (otW / 60).toFixed(2) : '—', otH ? (otH / 60).toFixed(2) : '—',
            leaveH ? hm(leaveH) : '—', status, exception,
          ]);
          cur.setDate(cur.getDate() + 1);
        }

        return ok({
          employee: {
            id: emp.id, code: emp.code, name: emp.name,
            department: emp.department?.name || '—', position: emp.position?.name || '—',
          },
          period: `${startKey} → ${endKey}`,
          columns: ['التاريخ', 'اليوم', 'الوردية', 'الدخول', 'الخروج', 'ساعات الوردية', 'إجمالي الساعات', 'ساعات العمل', 'تأخير (د)', 'خروج مبكر (د)', 'غياب', 'إضافي عادي', 'إضافي راحة (س)', 'إضافي عطلة (س)', 'إجازة', 'الحالة', 'استثناء'],
          rows: out,
          statistics: {
            dutyHours: hm(stats.dutyMin), workedHours: hm(stats.workedMin),
            otNormal: hm(stats.otNormal), otWeekend: (stats.otWeekend / 60).toFixed(2), otHoliday: (stats.otHoliday / 60).toFixed(2),
            lateMinutes: stats.lateM, earlyMinutes: stats.earlyM,
            absenceHours: hm(stats.absH), leaveHours: hm(stats.leaveH), presentDays: stats.presentDays,
          },
        });
      }

      default:
        throw new HttpError(404, 'تقرير غير معروف — النوع: daily|monthly|late|overtime|absence|leaves');
    }
  });
}
