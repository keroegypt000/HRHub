import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, ok } from '@/lib/api';

export interface ExpiryAlert {
  id: string;
  kind: 'passport' | 'iqama' | 'vehicle_license' | 'vehicle_insurance' | 'vehicle_inspection' | 'company_contract' | 'employee_contract';
  kindAr: string;
  title: string;      // اسم العنصر (اللوحة/الجواز/العقد)
  subtitle: string;   // تفاصيل إضافية
  expiry: string;     // ISO تاريخ الانتهاء
  daysLeft: number;   // سالب = منتهي
  level: 'expired' | 'd30' | 'd60' | 'd90';
}

const KIND_AR: Record<ExpiryAlert['kind'], string> = {
  passport: 'جواز سفر',
  iqama: 'إقامة',
  vehicle_license: 'رخصة سير مركبة',
  vehicle_insurance: 'تأمين مركبة',
  vehicle_inspection: 'فحص دوري مركبة',
  company_contract: 'عقد شركة',
  employee_contract: 'عقد موظف',
};

function levelOf(daysLeft: number): ExpiryAlert['level'] | null {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'd30';
  if (daysLeft <= 60) return 'd60';
  if (daysLeft <= 90) return 'd90';
  return null;
}

/** كل تنبيهات النفاذ في مكان واحد: جوازات، مستندات سيارات، عقود شركة، عقود موظفين */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'alerts');
    const now = Date.now();
    const alerts: ExpiryAlert[] = [];

    const push = (kind: ExpiryAlert['kind'], id: string, title: string, subtitle: string, expiry: Date) => {
      const daysLeft = Math.ceil((new Date(expiry).getTime() - now) / (24 * 3600_000));
      const level = levelOf(daysLeft);
      if (!level) return;
      alerts.push({ id, kind, kindAr: KIND_AR[kind], title, subtitle, expiry: new Date(expiry).toISOString(), daysLeft, level });
    };

    // الجوازات
    const passports = await db.passport.findMany({
      include: { employee: { select: { name: true, code: true } } },
    });
    for (const p of passports) {
      push('passport', p.id, `${p.passportNo} — ${p.holderName}`,
        p.employee ? `${p.employee.name} (${p.employee.code})` : p.nationality || '', p.expiryDate);
    }

    // الإقامات
    const iqamas = await db.iqama.findMany({
      include: { employee: { select: { name: true, code: true } } },
    });
    for (const q of iqamas) {
      push('iqama', q.id, `${q.iqamaNo} — ${q.holderName}`,
        q.employee ? `${q.employee.name} (${q.employee.code})` : q.nationality || q.sponsor || '', q.expiryDate);
    }

    // السيارات: رخصة + تأمين + فحص دوري
    const vehicles = await db.vehicle.findMany();
    for (const v of vehicles) {
      const label = `${v.make || ''} ${v.model || ''} (${v.plateNo})`.trim();
      if (v.licenseExpiry) push('vehicle_license', v.id, label, 'رخصة سير', v.licenseExpiry);
      if (v.insuranceExpiry) push('vehicle_insurance', v.id, label, `تأمين ${v.insuranceCompany || ''}`.trim(), v.insuranceExpiry);
      if (v.inspectionExpiry) push('vehicle_inspection', v.id, label, 'فحص دوري', v.inspectionExpiry);
    }

    // عقود الشركة
    const companyContracts = await db.companyContract.findMany({ where: { status: 'active' } });
    for (const c of companyContracts) {
      push('company_contract', c.id, c.name, c.counterparty || c.type || '', c.endDate);
    }

    // عقود الموظفين النشطة ذات نهاية
    const employeeContracts = await db.contract.findMany({
      where: { status: 'active', endDate: { not: null } },
      include: { employee: { select: { name: true, code: true } } },
    });
    for (const c of employeeContracts) {
      if (!c.endDate) continue;
      push('employee_contract', c.id, c.contractNo, c.employee ? `${c.employee.name} (${c.employee.code})` : '', c.endDate);
    }

    alerts.sort((a, b) => a.daysLeft - b.daysLeft);
    const summary = {
      expired: alerts.filter((a) => a.level === 'expired').length,
      d30: alerts.filter((a) => a.level === 'd30').length,
      d60: alerts.filter((a) => a.level === 'd60').length,
      d90: alerts.filter((a) => a.level === 'd90').length,
    };
    return ok({ alerts, summary, total: alerts.length });
  });
}
