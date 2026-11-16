// lib/link-punches.ts — ربط البصمات «غير المعروفة» بالموظف تلقائيًا عند إضافته أو تعديل رقمه
// البصمة تُسجَّل برقم الجهاز (PIN)؛ لو الموظف أضيف بعدها، نربط كل بصماته السابقة ونعيد حساب الحضور
import { db } from '@/lib/db';
import { recomputeRange } from '@/lib/attendance';

const dayKey = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/** يربط البصمات غير المربوطة برقم الموظف (PIN أو الرقم الوظيفي) — يرجع عدد البصمات المربوطة */
export async function linkPunchesToEmployees(employeeIds: string[]): Promise<number> {
  if (!employeeIds.length) return 0;
  const emps = await db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, pin: true, code: true } });
  let total = 0;
  const touched: string[] = [];
  for (const e of emps) {
    const keys = [...new Set([e.pin, e.code].filter((k): k is string => !!k && !!k.trim()))];
    if (!keys.length) continue;
    const res = await db.attendanceLog.updateMany({ where: { pin: { in: keys }, employeeId: null }, data: { employeeId: e.id } });
    if (res.count) { total += res.count; touched.push(e.id); }
  }
  if (touched.length) {
    // إعادة حساب الحضور من أقدم بصمة مربوطة (بحد أقصى سنة للخلف — الأقدم لا يؤثر على الرواتب الحالية)
    const first = await db.attendanceLog.findFirst({ where: { employeeId: { in: touched } }, orderBy: { punchTime: 'asc' }, select: { punchTime: true } });
    const yearAgo = new Date(Date.now() - 365 * 86400_000);
    const from = first && first.punchTime > yearAgo ? first.punchTime : yearAgo;
    await recomputeRange({ from: dayKey(from), to: dayKey(new Date()), employeeIds: touched }).catch(() => {});
  }
  return total;
}
