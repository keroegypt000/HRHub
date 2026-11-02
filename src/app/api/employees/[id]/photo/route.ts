import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { saveFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** رفع صورة موظف — مع تخزين داخل القاعدة (وضع احتياطي) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'employees-photo');
    const { id } = await ctx.params;
    const emp = await db.employee.findUnique({ where: { id } });
    if (!emp) return fail(404, 'الموظف غير موجود');

    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, 'تحقق من البيانات — أرسل الملف بصيغة multipart');
    const file = form.get('file') as File | null;
    if (!file) return fail(400, 'أرفق ملف الصورة');
    if (!file.type.startsWith('image/')) return fail(400, 'الملف يجب أن يكون صورة');
    if (file.size > 5 * 1024 * 1024) return fail(400, 'حجم الصورة أكبر من 5 ميجابايت');

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveFile({
      fileName: file.name,
      mimeType: file.type,
      data: buf,
      ownerTag: 'employee_photo',
      employeeId: id,
      createdBy: user.id,
    });

    // حذف الصورة القديمة
    if (emp.photoId) {
      await db.fileUpload.delete({ where: { id: emp.photoId } }).catch(() => {});
    }
    await db.employee.update({ where: { id }, data: { photoId: saved.id } });

    await logAudit({ userId: user.id, action: 'update', entity: 'employee', entityId: id, description: `رفع صورة للموظف: ${emp.name}` });
    await createRestorePoint(user.id, `رفع صورة للموظف: ${emp.name}`);
    return ok({ photoId: saved.id, url: `/api/files/${saved.id}` }, 201);
  });
}
