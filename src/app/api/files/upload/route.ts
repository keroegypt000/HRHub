import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { saveFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

/** رفع ملف مرفق (عقد / مستند موظف) — تخزين داخل القاعدة كوضع احتياطي */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'files');

    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, 'أرسل الملف بصيغة multipart/form-data');
    const file = form.get('file') as File | null;
    if (!file) return fail(400, 'أرفق الملف المطلوب');
    if (file.size > 10 * 1024 * 1024) return fail(400, 'حجم الملف أكبر من 10 ميجابايت');

    const employeeId = (form.get('employeeId') as string | null)?.trim() || null;
    const ownerTag = (form.get('ownerTag') as string | null)?.trim() || 'contract_file';

    let empName = '';
    if (employeeId) {
      const emp = await db.employee.findUnique({ where: { id: employeeId } });
      if (!emp) return fail(404, 'الموظف غير موجود');
      empName = emp.name;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveFile({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: buf,
      ownerTag,
      employeeId,
      createdBy: user.id,
    });

    await logAudit({
      userId: user.id, action: 'create', entity: 'file', entityId: saved.id,
      description: `رفع ملف: ${file.name}${empName ? ` للموظف ${empName}` : ''}`,
    });
    await createRestorePoint(user.id, `رفع ملف: ${file.name}`);
    return ok({ fileId: saved.id, url: `/api/files/${saved.id}` }, 201);
  });
}
