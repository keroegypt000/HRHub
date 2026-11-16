import { NextRequest } from 'next/server';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { importDeviceUsers, DevicePullError } from '@/lib/device-pull';

/** POST /api/devices/[id]/import-users — إضافة موظفي جهاز البصمة للنظام وربط بصماتهم */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees');
    const { id } = await ctx.params;
    try {
      return ok(await importDeviceUsers(id, user.id));
    } catch (e) {
      if (e instanceof DevicePullError) return fail(502, e.message);
      throw e;
    }
  });
}
