// مستندات الموظف من شاشة الموظف نفسها: الجواز والإقامة والكرت الصحي
// تُحفظ في جداولها مباشرة فتظهر في التنبيهات فورًا
import { db } from '@/lib/db';

export const DOC_FIELDS = ['passportExpiry', 'iqamaNo', 'iqamaExpiry', 'healthCardNo', 'healthCardExpiry'] as const;

/** يشيل الحقول الافتراضية من بيانات الموظف قبل الحفظ (ليست أعمدة في جدول الموظفين) */
export function stripDocFields(data: Record<string, unknown>) {
  for (const k of DOC_FIELDS) delete data[k];
  return data;
}

const toDate = (v: unknown): Date | null => {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** إنشاء/تحديث سجلات الجواز والإقامة والكرت الصحي من نموذج الموظف */
export async function syncEmployeeDocs(employeeId: string, body: Record<string, unknown>) {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { name: true, nationality: true, passportNo: true, civilId: true } });
  if (!emp) return;

  const passportExpiry = toDate(body.passportExpiry);
  if (passportExpiry && emp.passportNo) {
    const existing = await db.passport.findFirst({ where: { employeeId, passportNo: emp.passportNo } });
    if (existing) await db.passport.update({ where: { id: existing.id }, data: { expiryDate: passportExpiry, holderName: emp.name, nationality: emp.nationality } });
    else await db.passport.create({ data: { employeeId, holderName: emp.name, passportNo: emp.passportNo, nationality: emp.nationality, expiryDate: passportExpiry } });
  }

  const iqamaExpiry = toDate(body.iqamaExpiry);
  const iqamaNo = str(body.iqamaNo) || emp.civilId;
  if (iqamaExpiry && iqamaNo) {
    const existing = await db.iqama.findFirst({ where: { employeeId, iqamaNo } });
    if (existing) await db.iqama.update({ where: { id: existing.id }, data: { expiryDate: iqamaExpiry, holderName: emp.name, nationality: emp.nationality } });
    else await db.iqama.create({ data: { employeeId, holderName: emp.name, iqamaNo, nationality: emp.nationality, expiryDate: iqamaExpiry } });
  }

  const healthExpiry = toDate(body.healthCardExpiry);
  if (healthExpiry) {
    const cardNo = str(body.healthCardNo);
    const existing = await db.healthCard.findFirst({ where: { employeeId, ...(cardNo ? { cardNo } : {}) }, orderBy: { expiryDate: 'desc' } });
    if (existing) await db.healthCard.update({ where: { id: existing.id }, data: { expiryDate: healthExpiry, cardNo: cardNo ?? existing.cardNo } });
    else await db.healthCard.create({ data: { employeeId, cardNo, expiryDate: healthExpiry } });
  }
}
