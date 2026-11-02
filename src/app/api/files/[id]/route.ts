import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ok, fail, handle } from '@/lib/api';
import { canRead } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

/** تنزيل/عرض ملف */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    const file = await db.fileUpload.findUnique({ where: { id } });
    if (!file || !file.data) return fail(404, 'الملف غير موجود');
    const body = Buffer.from(file.data);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('غير مصرح', { status: 401 });
  }
}

/** حذف ملف */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    if (!canRead(user, 'employees')) return fail(403, 'ليست لديك صلاحية');
    const { id } = await ctx.params;
    const file = await db.fileUpload.findUnique({ where: { id } });
    if (!file) return fail(404, 'الملف غير موجود');
    await db.fileUpload.delete({ where: { id } });
    await logAudit({ userId: user.id, action: 'delete', entity: 'file', entityId: id, description: `حذف ملف: ${file.fileName}` });
    return ok({ deleted: true });
  });
}
