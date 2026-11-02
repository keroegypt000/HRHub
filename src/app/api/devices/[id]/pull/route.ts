import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { pullFromLocalDevice, LocalDeviceError } from '@/lib/zk/local';
import { resolveEmployeeByPin, recomputeRange } from '@/lib/attendance';

function dateKeySafe(d: Date): string {
  // توقيت الكويت UTC+3 — مفتاح اليوم
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * POST /api/devices/[id]/pull — سحب البصمات من جهاز محلي (بروتوكول ZK — منفذ 4370)
 * للجهاز على نفس شبكة السيرفر (أو عبر Port Forwarding) الذي لا يرسل ADMS Push.
 * السجلات تُدرج في نفس الجدول الموحد بـ source=local مع منع التكرار بالقيد الفريد.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const { id } = await ctx.params;
    const device = await db.device.findUnique({ where: { id } });
    if (!device) return fail(404, 'الجهاز غير موجود');
    if (!device.enabled) return fail(400, 'الجهاز معطّل — فعّله أولًا');
    if (!device.ipAddress) return fail(400, 'لم يُسجَّل عنوان IP للجهاز — عدّل الجهاز وأدخل IP الشبكة الخاص به');

    let result;
    try {
      result = await pullFromLocalDevice({
        ip: device.ipAddress,
        port: device.port || 4370,
        timeoutMs: 8000,
        commKey: device.commKey || undefined,
      });
    } catch (e) {
      // فشل الجهاز لا يوقف النظام — رسالة عربية واضحة
      if (e instanceof LocalDeviceError) return fail(502, e.message);
      return fail(502, `تعذر الاتصال بالجهاز المحلي ${device.ipAddress} — تأكد أن السيرفر يستطيع الوصول إليه على المنفذ 4370`);
    }

    // إدخال السجلات بمنع التكرار — القيد الفريد (sn, pin, punchTime, status)
    let inserted = 0; let duplicates = 0;
    const affectedDays = new Set<string>();
    const sn = result.info.sn?.trim() || device.sn; // SN الفعلي من الجهاز إن توفّر

    for (const p of result.punches) {
      try {
        const emp = await resolveEmployeeByPin(p.pin);
        await db.attendanceLog.create({
          data: {
            sn, pin: p.pin, employeeId: emp?.id || null,
            punchTime: p.punchTime, status: p.status, verify: p.verify,
            source: 'local',
          },
        });
        inserted++;
        affectedDays.add(dateKeySafe(p.punchTime));
      } catch {
        duplicates++; // سجلة مكررة — الجهاز يخزن تاريخًا كاملًا وإعادة السحب لا تولد سجلات جديدة
      }
    }

    // مطابقة أسماء المستخدمين من الجهاز مع الموظفين غير المربوطين (اختياري)
    let matchedUsers = 0;
    for (const u of result.users) {
      if (!u.name) continue;
      const emp = await resolveEmployeeByPin(u.pin);
      if (emp) continue;
      const byName = await db.employee.findFirst({ where: { name: u.name, pin: null } });
      if (byName) {
        await db.employee.update({ where: { id: byName.id }, data: { pin: u.pin } });
        matchedUsers++;
      }
    }

    // إعادة معالجة الحضور للأيام المتأثرة
    const days = Array.from(affectedDays).sort();
    if (days.length) {
      await recomputeRange({ from: days[0], to: days[days.length - 1] }).catch(() => {});
    }

    await db.device.update({
      where: { id: device.id },
      data: {
        lastPullAt: new Date(),
        lastSeenAt: new Date(),
        status: 'online',
        sn: sn !== device.sn && !(await db.device.findUnique({ where: { sn } }))
          ? sn : device.sn, // تحديث SN إن اختلف ولم يتصادم
      },
    });

    await logAudit({
      userId: user.id, action: 'sync', entity: 'device', entityId: id,
      description: `سحب محلي من ${device.name} (${device.ipAddress}): ${inserted} سجلة جديدة، ${duplicates} مكررة، ${result.punches.length} إجمالًا`,
    });

    return ok({
      pulled: true,
      deviceSn: sn,
      totalOnDevice: result.punches.length,
      inserted,
      duplicates,
      daysRecomputed: days.length,
      matchedUsers,
      usersOnDevice: result.users.length,
      deviceInfo: result.info,
      durationMs: result.durationMs,
      message: inserted
        ? `تم سحب ${inserted} سجلة جديدة (${duplicates} مكررة متجاهلة) — أعيد حساب ${days.length} يوم`
        : `لا سجلات جديدة — كل ${result.punches.length} سجلة على الجهاز مستوردة مسبقًا`,
    });
  });
}
