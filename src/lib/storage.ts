// lib/storage.ts — تخزين الصور والملفات: قاعدة البيانات كوضع احتياطي أساسي (R2 مستقبليًا)
import { db } from '@/lib/db';

export interface UploadParams {
  fileName: string;
  mimeType: string;
  data: Buffer;
  ownerTag?: string; // employee_photo|contract_file|leave_attachment
  employeeId?: string | null;
  createdBy?: string | null;
}

/**
 * حفظ ملف: يُخزن داخل قاعدة البيانات (Bytes) — وضع احتياطي موثوق بلا اعتماديات خارجية.
 * r2Key جاهز للاستخدام المستقبلي عند توفير بيانات اعتماد Cloudflare R2.
 */
export async function saveFile(params: UploadParams): Promise<{ id: string }> {
  const row = await db.fileUpload.create({
    data: {
      fileName: params.fileName,
      mimeType: params.mimeType,
      size: params.data.length,
      data: new Uint8Array(params.data),
      ownerTag: params.ownerTag || null,
      employeeId: params.employeeId || null,
      createdBy: params.createdBy || null,
    },
  });
  return { id: row.id };
}

export async function getFile(id: string) {
  return db.fileUpload.findUnique({ where: { id } });
}

export async function deleteFile(id: string): Promise<void> {
  await db.fileUpload.delete({ where: { id } }).catch(() => {});
}

/** رابط العرض عبر الـ API */
export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}
