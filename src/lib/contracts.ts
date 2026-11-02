// lib/contracts.ts — قواعد العقود: منع التداخل، التجديد بسلسلة، الحالة التلقائية، التنبيهات
import { db } from '@/lib/db';
import { dateKey } from '@/lib/time';

export interface ContractOverlapCheck {
  employeeId: string;
  contractId?: string; // للاستثناء عند التعديل
  startDate: Date;
  endDate?: Date | null;
}

/** التحقق من عدم تداخل عقدين نشطين لنفس الموظف — قاعدة العمل رقم 10 */
export async function checkContractOverlap(p: ContractOverlapCheck): Promise<string | null> {
  const active = await db.contract.findMany({
    where: { employeeId: p.employeeId, status: 'active', id: { not: p.contractId || undefined } },
  });
  const newEnd = p.endDate;
  for (const c of active) {
    const existingStart = c.startDate.getTime();
    const existingEnd = c.endDate ? c.endDate.getTime() : Infinity;
    const start = p.startDate.getTime();
    const end = newEnd ? newEnd.getTime() : Infinity;
    // تقاطع زمني: start <= existingEnd && existingStart <= end
    if (start <= existingEnd && existingStart <= end) {
      return `يتقاطع مع العقد النشط رقم ${c.contractNo} (${c.startDate.toISOString().slice(0, 10)} - ${c.endDate ? c.endDate.toISOString().slice(0, 10) : 'بلا نهاية'})`;
    }
  }
  return null;
}

/** تحديث حالة العقود: expired عند مرور endDate — تُنفذ مع أول عملية في اليوم (قاعدة 11) */
export async function refreshContractStatuses(): Promise<number> {
  const todayStart = new Date(`${dateKey()}T00:00:00.000Z`);
  const res = await db.contract.updateMany({
    where: { status: 'active', endDate: { lt: todayStart } },
    data: { status: 'expired' },
  });
  return res.count;
}

/** تنبيهات انتهاء العقود قبل 30/60/90 يومًا */
export interface ContractAlert {
  contractId: string;
  contractNo: string;
  employeeName: string;
  endDate: Date;
  daysLeft: number;
  level: 30 | 60 | 90;
}

export async function contractAlerts(): Promise<ContractAlert[]> {
  const contracts = await db.contract.findMany({
    where: { status: 'active', endDate: { not: null } },
    include: { employee: true },
  });
  const now = Date.now();
  const alerts: ContractAlert[] = [];
  for (const c of contracts) {
    if (!c.endDate) continue;
    const daysLeft = Math.ceil((c.endDate.getTime() - now) / (24 * 3600_000));
    let level: 30 | 60 | 90 | null = null;
    if (daysLeft >= 0 && daysLeft <= 30) level = 30;
    else if (daysLeft > 30 && daysLeft <= 60) level = 60;
    else if (daysLeft > 60 && daysLeft <= 90) level = 90;
    if (level) {
      alerts.push({
        contractId: c.id,
        contractNo: c.contractNo,
        employeeName: c.employee.name,
        endDate: c.endDate,
        daysLeft,
        level,
      });
    }
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** إنشاء رقم عقد تجديد جديد مرتبط بالعقد الأصلي */
export function nextRenewalContractNo(baseNo: string): string {
  return `${baseNo}-R${Date.now().toString().slice(-6)}`;
}
