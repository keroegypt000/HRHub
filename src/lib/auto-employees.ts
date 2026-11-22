// أي رقم يبصم على جهاز وهو غير مسجل → يُضاف موظفًا تلقائيًا (بيانات ناقصة) وتُربط بصماته
import { db } from '@/lib/db';
import { resolveEmployeeByPin, computeDay } from '@/lib/attendance';
import { getDeviceUsers } from '@/lib/zk/adms';
import { linkPunchesToEmployees } from '@/lib/link-punches';
import { licenseLimit } from '@/lib/license';

export const AUTO_NOTE = 'أضيف تلقائيًا من جهاز البصمة — أكمل بياناته';

/** ينشئ موظفين للأرقام غير المسجلة ويربط بصماتهم ويحسب حضورهم — يرجع عدد الموظفين الجدد */
export async function ensureEmployeesForPins(pins: Iterable<string>, sn: string): Promise<number> {
  const list = [...new Set([...pins].map((p) => String(p).trim()).filter(Boolean))];
  if (!list.length) return 0;
  const names = await getDeviceUsers(sn).catch(() => ({} as Record<string, string>));
  const device = await db.device.findUnique({ where: { sn }, select: { name: true } });
  const created: string[] = [];
  // حد الترخيص: لا نضيف موظفين جددًا بعده (البصمات تبقى محفوظة في السجل الخام)
  const max = await licenseLimit('employees').catch(() => null);
  let count = max !== null ? await db.employee.count({ where: { status: { notIn: ['terminated', 'deceased'] } } }) : 0;
  for (const pin of list) {
    if (await resolveEmployeeByPin(pin)) continue;
    if (max !== null && count >= max) break;
    count++;
    const codeTaken = await db.employee.findUnique({ where: { code: pin }, select: { id: true } });
    const code = codeTaken ? `${pin}-${sn.slice(-4)}` : pin;
    try {
      const emp = await db.employee.create({
        data: {
          code, pin, name: names[pin] || `موظف ${pin}`, status: 'active', basicSalary: 0,
          notes: `${AUTO_NOTE}${device ? ` (${device.name})` : ''}`,
        },
      });
      created.push(emp.id);
    } catch { /* أضيف بالتوازي من طلب آخر */ }
  }
  if (created.length) await linkPunchesToEmployees(created);
  return created.length;
}

/** إعادة حساب الأيام التي وصلت فيها بصمات (لكل موظف) — وليس اليوم فقط */
export async function recomputeDays(pairs: Map<string, Set<string>>) {
  for (const [employeeId, days] of pairs) {
    for (const d of [...days].sort().slice(-400)) await computeDay(employeeId, d).catch(() => null);
  }
}

/**
 * مرة عند التشغيل: الأرقام غير المسجلة التي بصمت خلال آخر 30 يومًا (موظفون حاليون)
 * تُضاف موظفين — الأرقام القديمة فقط (موظفون سابقون غالبًا) تبقى في سجل البصمات الخام
 */
export async function backfillRecentUnknownPins(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await db.attendanceLog.groupBy({ by: ['sn', 'pin'], where: { employeeId: null, punchTime: { gte: since }, sn: { not: 'MANUAL-HR' } } });
  let n = 0;
  const bySn = new Map<string, string[]>();
  for (const r of rows) { if (!bySn.has(r.sn)) bySn.set(r.sn, []); bySn.get(r.sn)!.push(r.pin); }
  for (const [sn, pins] of bySn) n += await ensureEmployeesForPins(pins, sn);
  return n;
}
