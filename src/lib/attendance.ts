// lib/attendance.ts — خط معالجة الحضور: يحوّل السجلات الخام إلى حالة يومية نهائية
// القواعد: أولوية اليوم عطلة←إجازة←راحة←عمل، firstIn/lastOut، missed_punch لسجل واحد،
// التأخير والخروج المبكر بالسماحية، الإضافي المقرَّب، تجاوز منتصف الليل للورديات الليلية.
import { db } from '@/lib/db';
import {
  dateKey, dayRange, kuwaitMidnight, minutesBetween, hmToMinutes,
  shiftMoment, weekdayIndex, addDaysKey,
} from '@/lib/time';
import { getSettings } from '@/lib/settings';

export interface DayComputeResult {
  employeeId: string;
  date: string;
  status: string;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;
  note: string | null;
}

function parseWorkDays(json: string): number[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(Number) : [0, 1, 2, 3, 4];
  } catch {
    return [0, 1, 2, 3, 4];
  }
}

/** هل التاريخ داخل نطاق عطلة رسمية؟ */
async function findHoliday(key: string): Promise<{ name: string } | null> {
  const dayStart = kuwaitMidnight(key);
  const holidays = await db.holiday.findMany({
    where: {
      OR: [
        { date: { lte: dayStart }, endDate: null },
        { date: { lte: dayStart }, endDate: { gte: dayStart } },
        { date: { gte: dayStart, lte: dayStart } },
      ],
    },
  });
  for (const h of holidays) {
    const startKey = dateKey(h.date);
    const endKey = h.endDate ? dateKey(h.endDate) : startKey;
    if (key >= startKey && key <= endKey) return { name: h.name };
  }
  // عطلات متكررة سنويًا
  const recurring = await db.holiday.findMany({ where: { recurring: true } });
  const mmdd = key.slice(5);
  for (const h of recurring) {
    const startKey = dateKey(h.date);
    const endKey = h.endDate ? dateKey(h.endDate) : startKey;
    if (mmdd >= startKey.slice(5) && mmdd <= endKey.slice(5)) return { name: h.name };
  }
  return null;
}

/** هل التاريخ مغطى بإجازة معتمدة؟ */
async function findApprovedLeave(employeeId: string, key: string): Promise<{ typeName: string; paid: boolean } | null> {
  const dayStart = kuwaitMidnight(key);
  const leaves = await db.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      fromDate: { lte: dayStart },
      toDate: { gte: dayStart },
    },
    include: { leaveType: true },
  });
  for (const l of leaves) {
    const fromKey = dateKey(l.fromDate);
    const toKey = dateKey(l.toDate);
    if (key >= fromKey && key <= toKey) {
      return { typeName: l.leaveType.name, paid: l.leaveType.paid };
    }
  }
  return null;
}

/** الوردية السارية لموظف في يوم معين — آخر توزيعة سارية ثم الافتراضية من الإعدادات */
export async function resolveShift(employeeId: string, key: string): Promise<{ id: string | null; shift: { id: string; name: string; type: string; startTime: string; endTime: string; crossDay: boolean; graceMinutes: number; earlyGraceMinutes: number; otEnabled: boolean; otRoundMinutes: number; halfDayMinutes: number; workDays: string } | null }> {
  const dayStart = kuwaitMidnight(key);
  const assignments = await db.shiftAssignment.findMany({
    where: { employeeId, fromDate: { lte: dayStart } },
    orderBy: { fromDate: 'desc' },
    include: { shift: true },
  });
  let shift = null;
  for (const a of assignments) {
    if (a.fromDate.getTime() > dayStart.getTime()) continue;
    if (a.toDate && a.toDate.getTime() < dayStart.getTime()) continue;
    shift = a.shift;
    break;
  }
  if (!shift) {
    const settings = await getSettings();
    if (settings.defaultShiftId) {
      const def = await db.shift.findUnique({ where: { id: settings.defaultShiftId } });
      if (def && def.active) shift = def;
    }
  }
  return { id: shift?.id || null, shift: shift || null };
}

/**
 * إعادة معالجة يوم واحد لموظف — يُبنى من السجلات الخام من الصفر.
 */
export async function computeDay(employeeId: string, key: string): Promise<DayComputeResult | null> {
  const { from, to } = dayRange(key);
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return null;

  const { id: shiftId, shift } = await resolveShift(employeeId, key);
  const logs = await db.attendanceLog.findMany({
    where: { employeeId, punchTime: { gte: from, lt: to } },
    orderBy: { punchTime: 'asc' },
  });

  // أولوية تغطية اليوم (قاعدة 5): عطلة ← إجازة معتمدة ← راحة أسبوعية ← يوم عمل
  const holiday = await findHoliday(key);
  const leave = await findApprovedLeave(employeeId, key);
  const workDays = parseWorkDays(shift?.workDays || '[0,1,2,3,4]');
  const isWeekend = !workDays.includes(weekdayIndex(from));

  let baseStatus: 'holiday' | 'leave' | 'weekend' | 'work';
  let note: string | null = null;
  if (holiday) {
    baseStatus = 'holiday';
    note = `عطلة رسمية: ${holiday.name}`;
  } else if (leave) {
    baseStatus = 'leave';
    note = `إجازة معتمدة: ${leave.typeName}${leave.paid ? '' : ' (بدون راتب)'}`;
  } else if (isWeekend) {
    baseStatus = 'weekend';
    note = 'راحة أسبوعية';
  } else {
    baseStatus = 'work';
  }

  let firstIn: Date | null = null;
  let lastOut: Date | null = null;
  let workedMinutes = 0;
  let lateMinutes = 0;
  let earlyMinutes = 0;
  let otMinutes = 0;
  let status = baseStatus === 'work' ? 'absent' : baseStatus;

  if (logs.length > 0) {
    const punches = logs.map((l) => new Date(l.punchTime));
    firstIn = punches[0];
    lastOut = punches[punches.length - 1];
    workedMinutes = minutesBetween(firstIn, lastOut);

    // سجل واحد فقط أو فرق أقل من 10 دقائق = missed_punch (قاعدة 6)
    if (logs.length < 2 || workedMinutes < 10) {
      if (baseStatus === 'work') status = 'missed_punch';
      workedMinutes = logs.length < 2 ? 0 : workedMinutes;
      if (logs.length < 2) { firstIn = null; lastOut = null; }
    } else {
      const dayStart = from;
      const startMin = hmToMinutes(shift?.startTime || '08:00');
      const endMin = hmToMinutes(shift?.endTime || '17:00');
      const crossDay = shift?.crossDay || endMin < startMin;

      // دخول/خروج فعليان (نستخدم أول وأقرب سجلة وأبعد سجلة)
      const actualIn = firstIn!;
      const actualOut = lastOut!;

      // الإضافي من أزواج OT-in/OT-out إن وُجدت (status 4/5)
      const otPairs = logs.filter((l) => l.status === 4 || l.status === 5);
      let deviceOt = 0;
      if (otPairs.length >= 2) {
        let otIn: Date | null = null;
        for (const l of logs) {
          if (l.status === 4) otIn = new Date(l.punchTime);
          if (l.status === 5 && otIn) {
            deviceOt += minutesBetween(otIn, new Date(l.punchTime));
            otIn = null;
          }
        }
      }

      // حساب التأخير والخروج المبكر والإضافي — لا يُحسب في راحة/عطلة (قاعدة 6)
      const grace = shift?.graceMinutes ?? 10;
      const earlyGrace = shift?.earlyGraceMinutes ?? 10;
      const otEnabled = shift?.otEnabled ?? true;
      const otRound = shift?.otRoundMinutes ?? 15;
      const halfDay = shift?.halfDayMinutes ?? 240;

      if (baseStatus === 'work') {
        // لحظات بداية ونهاية الوردية المتوقعة (الورديات الليلية تضيف 24 ساعة تلقائيًا)
        const expectedStart = shiftMoment(dayStart, startMin);
        const expectedEnd = crossDay ? shiftMoment(dayStart, endMin + 1440) : shiftMoment(dayStart, endMin);

        // تأخير فعلي: إذا دخل بعد (بداية الوردية + سماحية) — الدخول المبكر لا تأخير
        const graceDeadline = new Date(expectedStart.getTime() + grace * 60_000);
        lateMinutes = Math.max(0, minutesBetween(graceDeadline, actualIn));

        // خروج مبكر: إذا خرج قبل (نهاية الوردية − سماحية)
        const earlyDeadline = new Date(expectedEnd.getTime() - earlyGrace * 60_000);
        earlyMinutes = Math.max(0, minutesBetween(actualOut, earlyDeadline));

        // الحالة النهائية
        if (workedMinutes < halfDay) status = 'half_day';
        else if (lateMinutes > 0) status = 'late';
        else status = 'present';

        // الإضافي: المدة بعد نهاية الوردية مقرَّبة لأقرب otRoundMinutes
        if (otEnabled) {
          let ot = Math.max(0, minutesBetween(expectedEnd, actualOut));
          if (deviceOt > ot) ot = deviceOt;
          otMinutes = Math.floor(ot / otRound) * otRound;
        }
      } else {
        // يوم عطلة/إجازة/راحة فيه بصمات — الإضافي بكل الدuration يُقرَّب
        if (otEnabled && workedMinutes >= 60) {
          otMinutes = Math.floor(workedMinutes / otRound) * otRound;
        }
        status = baseStatus;
      }
    }
  }

  const data = {
    employeeId,
    date: from,
    shiftId,
    firstIn,
    lastOut,
    workedMinutes,
    lateMinutes,
    earlyMinutes,
    otMinutes,
    status,
    note,
    processedAt: new Date(),
  };

  await db.dailyAttendance.upsert({
    where: { employeeId_date: { employeeId, date: from } },
    update: data,
    create: data,
  });

  return { employeeId, date: key, status, firstIn, lastOut, workedMinutes, lateMinutes, earlyMinutes, otMinutes, note };
}

/** إعادة معالجة نطاق زمني لموظف محدد أو الجميع */
export async function recomputeRange(opts: {
  from: string; // YYYY-MM-DD
  to: string;
  employeeId?: string;
}): Promise<{ days: number; employees: number }> {
  const employees = await db.employee.findMany({
    where: opts.employeeId ? { id: opts.employeeId } : { status: { not: 'terminated' } },
    select: { id: true },
  });
  let days = 0;
  let current = opts.from;
  let guard = 0;
  while (current <= opts.to && guard < 400) {
    for (const emp of employees) {
      await computeDay(emp.id, current);
      days++;
    }
    current = addDaysKey(current, 1);
    guard++;
  }
  return { days, employees: employees.length };
}

/** معالجة يوم لكل موظف (تُستدعى بعد وصول سجلات جديدة) */
export async function recomputeDayForEmployees(employeeIds: string[], key: string): Promise<void> {
  for (const id of employeeIds) await computeDay(id, key);
}

/** ربط pin بموظف: أولًا حقل pin ثم code (قاعدة 4) */
export async function resolveEmployeeByPin(pin: string): Promise<{ id: string } | null> {
  const byPin = await db.employee.findFirst({ where: { pin: pin }, select: { id: true } });
  if (byPin) return byPin;
  const byCode = await db.employee.findUnique({ where: { code: pin }, select: { id: true } });
  return byCode;
}
