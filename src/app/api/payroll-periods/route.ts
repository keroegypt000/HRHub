import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';
import { refreshContractStatuses, contractAlerts } from '@/lib/contracts';
import { daysInMonth } from '@/lib/time';

/** قائمة فترات الرواتب مع إجماليات */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'payroll-periods');
    const rows = await db.payrollPeriod.findMany({
      include: { _count: { select: { payslips: true } } },
      orderBy: { name: 'desc' },
    });
    const totals = await db.payslip.groupBy({
      by: ['periodId'],
      _sum: { netPay: true, totalEarnings: true, totalDeductions: true },
    });
    const totalsMap = new Map(totals.map((t) => [t.periodId, t]));
    return ok({
      rows: rows.map((r) => ({
        ...r,
        totalNet: totalsMap.get(r.id)?._sum.netPay || 0,
        totalEarnings: totalsMap.get(r.id)?._sum.totalEarnings || 0,
        totalDeductions: totalsMap.get(r.id)?._sum.totalDeductions || 0,
      })),
      contractAlerts: await contractAlerts(),
    });
  });
}

/** إنشاء فترة رواتب جديدة (مثال 2026-01) */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await refreshContractStatuses().catch(() => {});
    const user = await requireWrite(req, 'payroll-periods');
    const body = (await req.json().catch(() => ({}))) as { name?: string; notes?: string };
    const name = (body.name || '').trim();
    if (!/^\d{4}-\d{2}$/.test(name)) return fail(400, 'اسم الفترة بصيغة YYYY-MM مثل 2026-01');

    const exists = await db.payrollPeriod.findUnique({ where: { name } });
    if (exists) return fail(400, `فترة ${name} موجودة مسبقًا`);

    const total = daysInMonth(name);
    const startDate = new Date(`${name}-01T00:00:00.000+03:00`);
    const endDate = new Date(`${name}-${String(total).padStart(2, '0')}T00:00:00.000+03:00`);

    const created = await db.payrollPeriod.create({
      data: { name, startDate, endDate, status: 'draft', notes: body.notes || null },
    });
    await logAudit({
      userId: user.id, action: 'create', entity: 'payroll-period', entityId: created.id,
      description: `إنشاء فترة رواتب: ${name}`,
    });
    await createRestorePoint(user.id, `إنشاء فترة رواتب ${name}`);
    return ok(created, 201);
  });
}
