import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { computeDay } from '@/lib/attendance';
import { kuwaitMidnight } from '@/lib/time';

const KEY = /^\d{4}-\d{2}-\d{2}$/;
export const MANUAL_SN = 'MANUAL-HR';

/** جهاز افتراضي للبصمات التي تضيفها الموارد البشرية يدويًا (لا يظهر في قائمة الأجهزة) */
async function manualDevice() {
  return db.device.upsert({
    where: { sn: MANUAL_SN },
    update: {},
    create: { sn: MANUAL_SN, name: 'إدخال يدوي (الموارد البشرية)', mode: 'push', enabled: false, status: 'unknown' },
  });
}

/** GET ?employeeId=&date=YYYY-MM-DD — الاستثناء الحالي + سجلات اليوم */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'daily-attendance');
    const sp = new URL(req.url).searchParams;
    const employeeId = sp.get('employeeId') || '';
    const date = sp.get('date') || '';
    if (!employeeId || !KEY.test(date)) return fail(400, 'اختر الموظف والتاريخ');
    const from = kuwaitMidnight(date);
    const to = new Date(from.getTime() + 86400_000);
    const [exception, logs, day] = await Promise.all([
      db.attendanceException.findUnique({ where: { employeeId_date: { employeeId, date: from } } }),
      db.attendanceLog.findMany({ where: { employeeId, punchTime: { gte: from, lt: to } }, orderBy: { punchTime: 'asc' }, select: { id: true, punchTime: true, status: true, source: true } }),
      db.dailyAttendance.findUnique({ where: { employeeId_date: { employeeId, date: from } }, include: { shift: { select: { name: true, startTime: true, endTime: true } } } }),
    ]);
    return ok({ exception, logs, day });
  });
}

/**
 * POST — حفظ استثناء اليوم و/أو إضافة بصمات منسية
 * {employeeId, date, excuseLate, excuseEarly, markPresent, reason, punches?: [{time:'HH:MM', status:0|1}]}
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'daily-attendance');
    const b = (await req.json().catch(() => ({}))) as {
      employeeId?: string; date?: string; excuseLate?: boolean; excuseEarly?: boolean; markPresent?: boolean;
      reason?: string; punches?: { time: string; status: number }[];
    };
    if (!b.employeeId || !KEY.test(b.date || '')) return fail(400, 'اختر الموظف والتاريخ');
    const reason = (b.reason || '').trim();
    if (!reason) return fail(400, 'اكتب سبب الاستثناء (يظهر في كشف الحضور وسجل التدقيق)');
    const emp = await db.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, name: true, code: true, pin: true } });
    if (!emp) return fail(404, 'الموظف غير موجود');
    const from = kuwaitMidnight(b.date as string);

    // بصمات منسية يضيفها HR (تُسجل بمصدر «manual»)
    const punches = (b.punches || []).filter((p) => /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || ''));
    if (punches.length) {
      const dev = await manualDevice();
      for (const p of punches) {
        const t = new Date(`${b.date}T${p.time}:00.000+03:00`);
        await db.attendanceLog.create({
          data: { sn: dev.sn, pin: emp.pin || emp.code, employeeId: emp.id, punchTime: t, status: p.status === 1 ? 1 : 0, verify: 0, source: 'manual' },
        }).catch(() => { /* نفس البصمة موجودة */ });
      }
    }

    const any = !!(b.excuseLate || b.excuseEarly || b.markPresent);
    if (any) {
      const data = { excuseLate: !!b.excuseLate, excuseEarly: !!b.excuseEarly, markPresent: !!b.markPresent, reason, createdBy: user.id };
      await db.attendanceException.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: from } },
        update: data,
        create: { employeeId: emp.id, date: from, ...data },
      });
    }
    const day = await computeDay(emp.id, b.date as string);

    const parts = [b.excuseLate && 'تبرير تأخير', b.excuseEarly && 'تبرير خروج مبكر', b.markPresent && 'اعتباره حاضرًا', punches.length && `إضافة ${punches.length} بصمة`].filter(Boolean);
    await logAudit({
      userId: user.id, action: 'update', entity: 'daily-attendance', entityId: emp.id,
      description: `استثناء حضور ${emp.name} (${emp.code}) يوم ${b.date}: ${parts.join('، ') || 'بدون تغيير'} — السبب: ${reason}`,
    });
    return ok({ day });
  });
}

/** DELETE ?employeeId=&date= — إلغاء الاستثناء وإعادة حساب اليوم */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'daily-attendance');
    const sp = new URL(req.url).searchParams;
    const employeeId = sp.get('employeeId') || '';
    const date = sp.get('date') || '';
    if (!employeeId || !KEY.test(date)) return fail(400, 'اختر الموظف والتاريخ');
    await db.attendanceException.deleteMany({ where: { employeeId, date: kuwaitMidnight(date) } });
    const day = await computeDay(employeeId, date);
    await logAudit({ userId: user.id, action: 'delete', entity: 'daily-attendance', entityId: employeeId, description: `إلغاء استثناء حضور يوم ${date}` });
    return ok({ day });
  });
}
