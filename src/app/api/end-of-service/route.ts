import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok } from '@/lib/api';
import {
  INDEMNITY_LAW, yearsServed, indemnityFullByDays, capIndemnity, servicePeriodPercent, parseResignTiers,
  eosWage, normalizeEosBasis,
} from '@/lib/indemnity';
import { getSettings } from '@/lib/settings';
import { dateKey } from '@/lib/time';

/** حساب نهاية الخدمة لكل موظف (تقديري حتى اليوم) + التسويات الفعلية للمنصرفين */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'end-of-service');
    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employeeId');
    const today = new Date(`${dateKey()}T00:00:00.000+03:00`);
    const settings = await getSettings();
    const tiers = parseResignTiers(settings.eosResignTiers);

    const employees = await db.employee.findMany({
      where: employeeId ? { id: employeeId } : {},
      include: {
        department: { select: { name: true } },
        contracts: { where: { status: 'active' }, orderBy: { startDate: 'desc' }, take: 1 },
        settlements: { take: 1 }, // تسوية نهاية الخدمة إن وجدت
      },
      orderBy: { code: 'asc' },
    });

    const rows = employees.map((emp) => {
      const c = emp.contracts[0];
      // أجر المكافأة حسب الأساس: اختيار الموظف ← افتراضي الشركة
      const eosBasis = normalizeEosBasis(emp.eosBasis, normalizeEosBasis(settings.eosBasisDefault));
      const lastWage = eosWage({
        basic: c?.basicSalary ?? emp.basicSalary,
        housing: c?.housingAllowance ?? 0, transport: c?.transportAllowance ?? 0, other: c?.otherAllowance ?? 0,
      }, eosBasis);
      const years = yearsServed(emp.hireDate, today);
      const full = emp.hireDate ? capIndemnity(indemnityFullByDays(lastWage, emp.hireDate, today), lastWage) : 0;
      const st = emp.settlements[0] || null;

      return {
        id: emp.id,
        employeeId: emp.id,
        code: emp.code,
        name: emp.name,
        department: emp.department?.name || null,
        status: emp.status,
        hireDate: emp.hireDate ? emp.hireDate.toISOString() : null,
        departureDate: emp.departureDate ? emp.departureDate.toISOString() : null,
        departureReason: emp.departureReason,
        deathDate: emp.deathDate ? emp.deathDate.toISOString() : null,
        lastWage,
        eosBasis,
        years,
        // تقدير مستحق حتى اليوم (معامل استقالة للعرض فقط — النهائي يُحدد عند التسوية)
        eosAccrued: Math.round(full * 1000) / 1000,
        eosIfResigned: Math.round(full * (servicePeriodPercent('resigned', years, tiers) / 100) * 1000) / 1000,
        // التسوية الفعلية إن وجدت
        settlement: st ? {
          id: st.id, reason: st.reason, yearsServed: st.yearsServed, lastWage: st.lastWage,
          indemnityFull: st.indemnityFull, reasonFactor: st.reasonFactor,
          eosAmount: st.eosAmount, leaveAllowance: st.leaveAllowance,
          otherDues: st.otherDues, deductions: st.deductions,
          totalDue: st.totalDue, paidAmount: st.paidAmount,
          remaining: Math.round((st.totalDue - st.paidAmount) * 1000) / 1000,
          status: st.status,
        } : null,
      };
    });

    const active = rows.filter((r) => !r.settlement && r.status === 'active');
    const totals = {
      activeCount: active.length,
      accruedTotal: Math.round(active.reduce((s, r) => s + r.eosAccrued, 0) * 1000) / 1000,
      remainingDuesTotal: Math.round(rows.reduce((s, r) => s + (r.settlement ? r.settlement.remaining : 0), 0) * 1000) / 1000,
      noHireDate: rows.filter((r) => !r.hireDate).length,
    };

    return ok({ rows, totals, law: INDEMNITY_LAW, asOf: today.toISOString() });
  });
}
