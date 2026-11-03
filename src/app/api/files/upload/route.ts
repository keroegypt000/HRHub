// /api/files/upload — رفع ملف موظف (عقد/مستند) — كانت الواجهة تستدعيه ولم يكن موجودًا
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, handle, ok, fail } from '@/lib/api';
import { saveFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TAGS = new Set(['contract_file', 'leave_attachment', 'employee_document']);

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'files');
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, 'أرسل الملف بصيغة multipart');
    const file = form.get('file') as File | null;
    if (!file) return fail(400, 'أرفق الملف');
    if (file.size > MAX_BYTES) return fail(400, 'حجم الملف أكبر من 10 ميجابايت');

    const employeeId = String(form.get('employeeId') || '') || null;
    if (employeeId && !(await db.employee.findUnique({ where: { id: employeeId }, select: { id: true } }))) {
      return fail(404, 'الموظف غير موجود');
    }
    const tag = String(form.get('ownerTag') || 'employee_document');

    const saved = await saveFile({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
      ownerTag: ALLOWED_TAGS.has(tag) ? tag : 'employee_document',
      employeeId,
      createdBy: user.id,
    });
    await logAudit({
      userId: user.id, action: 'create', entity: 'file', entityId: saved.id,
      description: `رفع ملف ${file.name}${employeeId ? ' لملف موظف' : ''}`,
    });
    return ok({ id: saved.id, url: `/api/files/${saved.id}` }, 201);
  });
}
