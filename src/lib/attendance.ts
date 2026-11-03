// lib/attendance.ts — خط معالجة الحضور: يحوّل السجلات الخام إلى حالة يومية نهائية
// القواعد: أولوية اليوم عطلة←إجازة←راحة←عمل، firstIn/lastOut، missed_punch لسجل واحد،
// التأخير والخروج المبكر بالسماحية، الإضافي المقرَّب، تجاوز منتصف الليل للورديات الليلية.
import { db } from '@/lib/db';
import {
  dateKey, dayRange, kuwaitMidnight, minutesBetween, hmToMinutes,
  shiftMoment, weekdayIndex, addDaysKey,
} from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { effectiveWorkDays } from '@/lib/workweek';

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

/**
 * ساعات العمل من البصمات — مثل BioTime: البصمات أزواج (دخول ← خروج) فتُستبعد الاستراحات بينها.
 * تُدمج البصمات المكررة خلال دقيقتين، و4 بصمات فأكثر بعدد زوجي = مجموع الأزواج،
 * وغير ذلك (بصمتان أو عدد فردي) = من أول بصمة لآخر بصمة.
 */
export function workedFromPunches(punches: Date[]): number {
  const sorted = [...punches].sort((a, b) => a.getTime() - b.getTime());
  const uniq: Date[] = [];
  for (const p of sorted) {
    if (!uniq.length || p.getTime() - uniq[uniq.length - 1].getTime() > 2 * 60_000) uniq.push(p);
  }
  if (uniq.length < 2) return 0;
  if (uniq.length >= 4 && uniq.length % 2 === 0) {
    let total = 0;
    for (let i = 0; i < uniq.length; i += 2) total += minutesBetween(uniq[i], uniq[i + 1]);
    return total;
  }
  return minutesBetween(uniq[0], uniq[uniq.length - 1]);
}

/**
 * الدوام المرن (مثل BioTime: جدول 00:00-23:59 بمدة 8 ساعات) — لا تأخير ولا خروج مبكر،
 * المطلوب عدد ساعات في اليوم: ما زاد = إضافي، وما نقص = عجز (يظهر في عمود الخروج المبكر بالدقائق)
 */
export function flexibleDay(
  workedMinutes: number, dutyMinutes: number,
  opts: { halfDayMinutes: number; otRoundMinutes: number; otEnabled: boolean },
): { status: 'present' | 'half_day'; otMinutes: number; shortMinutes: number } {
  const round = opts.otRoundMinutes > 0 ? opts.otRoundMinutes : 1;
  const extra = Math.max(0, workedMinutes - dutyMinutes);
  return {
    status: workedMinutes < opts.halfDayMinutes ? 'half_day' : 'present',
    otMinutes: opts.otEnabled ? Math.floor(extra / round) * round : 0,
    shortMinutes: Math.max(0, dutyMinutes - workedMinutes),
  };
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
  let shift: Awaited<ReturnType<typeof db.shift.findUnique>> = null;
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
  const workDays = effectiveWorkDays(employee.weeklyOffDays, shift?.workDays);
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
    workedMinutes = workedFromPunches(punches);

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

      if (baseStatus === 'work' && shift?.type === 'flexible') {
        // دوام مرن: الساعات المطلوبة من الإعدادات (8 افتراضيًا) بدل بداية/نهاية ثابتة
        const settings = await getSettings();
        const flex = flexibleDay(workedMinutes, Math.round(settings.hoursPerDay * 60), {
          halfDayMinutes: halfDay, otRoundMinutes: otRound, otEnabled,
        });
        status = flex.status;
        otMinutes = Math.max(flex.otMinutes, deviceOt > 0 ? Math.floor(deviceOt / (otRound || 1)) * (otRound || 1) : 0);
        earlyMinutes = flex.shortMinutes;
      } else if (baseStatus === 'work') {
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
