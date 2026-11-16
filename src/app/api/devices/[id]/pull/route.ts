import { NextRequest } from 'next/server';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { pullDevice, DevicePullError } from '@/lib/device-pull';

/**
 * POST /api/devices/[id]/pull — سحب البصمات (وصورها) من جهاز على الشبكة المحلية:
 * ZKTeco (بروتوكول ZK — منفذ 4370) أو ACTAtek (REST/SOAP). منع التكرار بالقيد الفريد.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const { id } = await ctx.params;
    try {
      return ok(await pullDevice(id, user.id));
    } catch (e) {
      if (e instanceof DevicePullError) return fail(502, e.message);
      throw e;
    }
  });
}
