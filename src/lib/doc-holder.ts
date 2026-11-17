// تعبئة بيانات صاحب المستند (جواز/إقامة) تلقائيًا من ملف الموظف المرتبط
import { db } from '@/lib/db';

export async function fillFromEmployee(data: Record<string, unknown>, numberKey: 'passportNo' | 'iqamaNo') {
  const id = typeof data.employeeId === 'string' && data.employeeId ? data.employeeId : null;
  if (!id) return;
  const e = await db.employee.findUnique({ where: { id }, select: { name: true, nationality: true, passportNo: true, civilId: true } });
  if (!e) return;
  if (!data.holderName) data.holderName = e.name;
  if (!data.nationality && e.nationality) data.nationality = e.nationality;
  if (!data[numberKey]) {
    const fallback = numberKey === 'passportNo' ? e.passportNo : e.civilId;
    if (fallback) data[numberKey] = fallback;
  }
}
