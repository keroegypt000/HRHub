import { NextRequest } from 'next/server';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { pullDevice, DevicePullError } from '@/lib/device-pull';
import { db } from '@/lib/db';
import { resetStamps, queueCommands, fetchAllCommands } from '@/lib/zk/adms';

/**
 * POST /api/devices/[id]/pull — سحب البصمات (وصورها) من جهاز على الشبكة المحلية:
 * ZKTeco (بروتوكول ZK — منفذ 4370) أو ACTAtek (REST/SOAP). منع التكرار بالقيد الفريد.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const { id } = await ctx.params;
    // جهاز يرسل للبرنامج (ADMS): لا نتصل به — نطلب منه رفع كل ما عنده في أول اتصال قادم
    const dev = await db.device.findUnique({ where: { id } });
    if (dev && dev.mode === 'push' && dev.vendor !== 'actatek') {
      await resetStamps(dev.sn);
      await queueCommands(dev.sn, fetchAllCommands());
      const before = await db.attendanceLog.count({ where: { sn: dev.sn } });
      return ok({
        pulled: true, deviceSn: dev.sn, totalOnDevice: 0, inserted: 0, duplicates: 0, photos: 0, daysRecomputed: 0,
        matchedUsers: 0, usersOnDevice: 0, durationMs: 0, queued: true, logsBefore: before,
        message: `تم إرسال طلب رفع كل البصمات والصور إلى الجهاز ${dev.name}. سيبدأ الجهاز الرفع خلال دقيقة إذا كان متصلًا بالبرنامج — راجع «سجل البصمات» بعدها.`,
      });
    }
    try {
      return ok(await pullDevice(id, user.id));
    } catch (e) {
      if (e instanceof DevicePullError) return fail(502, e.message);
      throw e;
    }
  });
}
