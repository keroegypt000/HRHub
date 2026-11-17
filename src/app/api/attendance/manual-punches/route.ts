import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { computeDay } from '@/lib/attendance';
import { kuwaitMidnight, addDaysKey } from '@/lib/time';
import { MANUAL_SN } from '@/app/api/attendance-exceptions/route';

const KEY = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CELLS = 5000;

/**
 * POST — إدخال بصمات يدوي لموظف أو مجموعة موظفين لفترة (عند عطل الجهاز مثلًا)
 * {employeeIds[], from, to, inTime?, outTime?, reason, skipOffDays?=true}
 * - أيام الراحة والعطلات والإجازات تُتخطى (إلا لو skipOffDays=false)
 * - وقت خروج قبل وقت الدخول = خروج في اليوم التالي (وردية ليلية)
 * - السبب يظهر في ملاحظة اليوم بالتقارير وسجل التدقيق
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'daily-attendance');
    const b = (await req.json().catch(() => ({}))) as {
      employeeIds?: string[]; from?: string; to?: string; inTime?: string; outTime?: string; reason?: string; skipOffDays?: boolean;
    };
    const ids = [...new Set((b.employeeIds || []).filter(Boolean))];
    if (!ids.length) return fail(400, 'اختر موظفًا واحدًا على الأقل');
    const from = b.from || '';
    const to = b.to || from;
    if (!KEY.test(from) || !KEY.test(to) || to < from) return fail(400, 'حدد الفترة (من / إلى) بشكل صحيح');
    const inTime = (b.inTime || '').trim();
    const outTime = (b.outTime || '').trim();
    if (!inTime && !outTime) return fail(400, 'اكتب وقت الدخول أو الخروج');
    if ((inTime && !HM.test(inTime)) || (outTime && !HM.test(outTime))) return fail(400, 'الوقت لازم يكون بصيغة HH:MM مثل 08:00');
    const reason = (b.reason || '').trim();
    if (!reason) return fail(400, 'اكتب السبب (يظهر في التقارير وسجل التدقيق)');
    const skipOff = b.skipOffDays !== false;

    const days: string[] = [];
    for (let d = from, g = 0; d <= to && g < 400; d = addDaysKey(d, 1), g++) days.push(d);
    if (ids.length * days.length > MAX_CELLS) return fail(400, `العدد كبير (${ids.length * days.length} يوم-موظف) — قلل الفترة أو عدد الموظفين`);

    const emps = await db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true, pin: true } });
    const dev = await db.device.upsert({
      where: { sn: MANUAL_SN }, update: {},
      create: { sn: MANUAL_SN, name: 'إدخال يدوي (الموارد البشرية)', mode: 'push', enabled: false, status: 'unknown' },
    });

    let added = 0; let skipped = 0; let daysDone = 0;
    for (const emp of emps) {
      for (const day of days) {
        if (skipOff) {
          const pre = await computeDay(emp.id, day);
          if (pre && ['weekend', 'holiday', 'leave'].includes(pre.status)) { skipped++; continue; }
        }
        const stamps: { t: Date; status: number }[] = [];
        if (inTime) stamps.push({ t: new Date(`${day}T${inTime}:00.000+03:00`), status: 0 });
        if (outTime) {
          const outDay = inTime && outTime <= inTime ? addDaysKey(day, 1) : day;
          stamps.push({ t: new Date(`${outDay}T${outTime}:00.000+03:00`), status: 1 });
        }
        for (const s of stamps) {
          const exists = await db.attendanceLog.findFirst({ where: { employeeId: emp.id, punchTime: s.t }, select: { id: true } });
          if (exists) continue;
          await db.attendanceLog.create({
            data: { sn: dev.sn, pin: emp.pin || emp.code, employeeId: emp.id, punchTime: s.t, status: s.status, verify: 0, source: 'manual' },
          }).then(() => added++).catch(() => {});
        }
        // السبب يظهر كملاحظة على اليوم (استثناء بدون تبرير)
        const date = kuwaitMidnight(day);
        await db.attendanceException.upsert({
          where: { employeeId_date: { employeeId: emp.id, date } },
          update: { reason: `بصمة يدوية: ${reason}` },
          create: { employeeId: emp.id, date, excuseLate: false, excuseEarly: false, markPresent: false, reason: `بصمة يدوية: ${reason}`, createdBy: user.id },
        });
        await computeDay(emp.id, day);
        if (outTime && inTime && outTime <= inTime) await computeDay(emp.id, addDaysKey(day, 1));
        daysDone++;
      }
    }

    await logAudit({
      userId: user.id, action: 'create', entity: 'daily-attendance', entityId: emps.map((e) => e.code).join(','),
      description: `إدخال بصمات يدوي: ${emps.length} موظف، ${from} → ${to}، دخول ${inTime || '—'} خروج ${outTime || '—'} — ${added} بصمة، ${skipped} يوم راحة/إجازة تم تخطيه — السبب: ${reason}`,
    });
    return ok({ added, days: daysDone, skipped, employees: emps.length, message: `تمت إضافة ${added} بصمة لـ ${emps.length} موظف (${daysDone} يوم)${skipped ? ` — تم تخطي ${skipped} يوم راحة/عطلة/إجازة` : ''}` });
  });
}
