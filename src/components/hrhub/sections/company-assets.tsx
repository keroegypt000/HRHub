'use client';

// السيارات وعقود الشركة: صفحات مستقلة مقسمة حسب الشركة (تبويب لكل شركة) + نفس اللوحات داخل التنبيهات
import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, fmtKWD } from '@/lib/client';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { PageHeader } from '@/components/hrhub/common';
import { ExpiryBadge } from '@/components/hrhub/sections/alerts';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Row = Record<string, unknown> & { id: string };
type Co = { id: string; name: string } | null | undefined;
const ALL = '__all';
const NONE = '__none';

const byCompany = (sel: string) => (rows: Row[]) => {
  const list = rows.filter((r) => {
    const c = r.company as Co;
    return sel === ALL || (sel === NONE ? !c : c?.id === sel);
  });
  // في «كل الشركات»: مرتبة تحت اسم كل شركة
  return sel === ALL ? [...list].sort((a, b) => ((a.company as Co)?.name || 'ي').localeCompare((b.company as Co)?.name || 'ي')) : list;
};
const companyCol = { key: 'company', header: 'الشركة', render: (r: Row) => ((r.company as Co)?.name ? <span className="font-medium">{(r.company as Co)!.name}</span> : <span className="text-muted-foreground">—</span>) };

export function VehiclesPanel({ canWrite, company = ALL }: { canWrite: boolean; company?: string }) {
  const fixed = company !== ALL && company !== NONE ? company : '';
  return (
    <CrudPanel<Row>
      entityPath="/api/vehicles"
      entityLabel="مركبة"
      title="السيارات ومستنداتها"
      subtitle="رخصة السير والتأمين والفحص الدوري — تنبيه لكل مستند على حدة"
      canWrite={canWrite}
      searchPlaceholder="بحث برقم اللوحة أو السائق..."
      filterRows={byCompany(company)}
      columns={[
        ...(company === ALL ? [companyCol] : []),
        { key: 'plate', header: 'اللوحة', render: (r) => <span className="font-mono font-bold">{String(r.plateNo)}</span> },
        { key: 'make', header: 'الماركة/الموديل', render: (r) => `${r.make || ''} ${r.model || ''}`.trim() || '—' },
        { key: 'driver', header: 'السائق', render: (r) => String(r.driverName || '—'), hideOnMobile: true },
        { key: 'license', header: 'رخصة السير', render: (r) => <ExpiryBadge expiry={r.licenseExpiry as string | null} /> },
        { key: 'insurance', header: 'التأمين', render: (r) => <ExpiryBadge expiry={r.insuranceExpiry as string | null} /> },
        { key: 'inspection', header: 'الفحص الدوري', render: (r) => <ExpiryBadge expiry={r.inspectionExpiry as string | null} />, hideOnMobile: true },
      ]}
      fields={[
        { key: 'companyId', label: 'الشركة المالكة', type: 'select' },
        { key: 'plateNo', label: 'رقم اللوحة', type: 'text', required: true },
        { key: 'make', label: 'الماركة', type: 'text' },
        { key: 'model', label: 'الموديل', type: 'text' },
        { key: 'year', label: 'سنة الصنع', type: 'number' },
        { key: 'color', label: 'اللون', type: 'text' },
        { key: 'driverName', label: 'السائق المسؤول', type: 'text' },
        { key: 'licenseExpiry', label: 'انتهاء رخصة السير', type: 'date' },
        { key: 'insuranceExpiry', label: 'انتهاء التأمين', type: 'date' },
        { key: 'inspectionExpiry', label: 'انتهاء الفحص الدوري', type: 'date' },
        { key: 'insuranceCompany', label: 'شركة التأمين', type: 'text' },
        { key: 'policyNo', label: 'رقم الوثيقة', type: 'text' },
        { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ companyId: fixed }}
      loadOptions={optionLoaders.companies}
      rowToForm={(r) => ({
        ...r,
        companyId: (r.company as Co)?.id || '',
        licenseExpiry: r.licenseExpiry ? fmtDate(r.licenseExpiry as string) : '',
        insuranceExpiry: r.insuranceExpiry ? fmtDate(r.insuranceExpiry as string) : '',
        inspectionExpiry: r.inspectionExpiry ? fmtDate(r.inspectionExpiry as string) : '',
      })}
    />
  );
}

export function CompanyContractsPanel({ canWrite, company = ALL }: { canWrite: boolean; company?: string }) {
  const fixed = company !== ALL && company !== NONE ? company : '';
  return (
    <CrudPanel<Row>
      entityPath="/api/company-contracts"
      entityLabel="عقد شركة"
      title="عقود الشركة"
      subtitle="عقود التوريد والخدمات والإيجار — تنبيه قبل الانتهاء للتجديد في وقته"
      canWrite={canWrite}
      searchPlaceholder="بحث باسم العقد أو الطرف الآخر..."
      filterRows={byCompany(company)}
      columns={[
        ...(company === ALL ? [companyCol] : []),
        { key: 'name', header: 'العقد', render: (r) => <span className="font-medium">{String(r.name)}</span> },
        { key: 'counterparty', header: 'الطرف الآخر', render: (r) => String(r.counterparty || '—') },
        { key: 'type', header: 'النوع', render: (r) => String(r.type || '—'), hideOnMobile: true },
        { key: 'value', header: 'القيمة (د.ك)', render: (r) => <span className="tabular">{r.value ? fmtKWD(r.value as number) : '—'}</span>, hideOnMobile: true },
        { key: 'period', header: 'الفترة', render: (r) => <span className="tabular text-xs">{fmtDate(r.startDate as string | null)} → {fmtDate(r.endDate as string)}</span> },
        { key: 'status', header: 'النفاذ', render: (r) => <ExpiryBadge expiry={r.endDate as string} /> },
      ]}
      fields={[
        { key: 'companyId', label: 'الشركة', type: 'select' },
        { key: 'name', label: 'اسم/وصف العقد', type: 'text', required: true },
        { key: 'counterparty', label: 'الطرف الآخر', type: 'text' },
        { key: 'contractNo', label: 'رقم العقد', type: 'text' },
        { key: 'type', label: 'النوع', type: 'select', options: [
          { value: 'توريد', label: 'توريد' }, { value: 'خدمات', label: 'خدمات' },
          { value: 'إيجار', label: 'إيجار' }, { value: 'صيانة', label: 'صيانة' },
          { value: 'نقل', label: 'نقل' }, { value: 'أخرى', label: 'أخرى' },
        ] },
        { key: 'value', label: 'قيمة العقد (د.ك)', type: 'number' },
        { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
        { key: 'endDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
        { key: 'renewal', label: 'قابل للتجديد', type: 'switch' },
        { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ renewal: true, companyId: fixed }}
      loadOptions={optionLoaders.companies}
      rowToForm={(r) => ({
        ...r,
        companyId: (r.company as Co)?.id || '',
        startDate: r.startDate ? fmtDate(r.startDate as string) : '',
        endDate: r.endDate ? fmtDate(r.endDate as string) : '',
      })}
    />
  );
}

/** تبويب لكل شركة بعدد عناصرها + «كل الشركات» + «بدون شركة» */
function CompanyTabs({ countKey, value, onChange }: { countKey: 'vehicles' | 'contracts'; value: string; onChange: (v: string) => void }) {
  const [companies, setCompanies] = useState<{ id: string; name: string; n: number }[]>([]);
  const [none, setNone] = useState(0);
  useEffect(() => {
    const load = () => {
      api<{ rows: { id: string; name: string; _count?: Record<string, number> }[] }>('/api/companies?limit=500')
        .then((d) => setCompanies(d.rows.map((c) => ({ id: c.id, name: c.name, n: c._count?.[countKey] ?? 0 }))))
        .catch(() => {});
      api<{ rows: { company?: unknown }[] }>(`/api/${countKey === 'vehicles' ? 'vehicles' : 'company-contracts'}?limit=2000`)
        .then((d) => setNone(d.rows.filter((r) => !r.company).length))
        .catch(() => {});
    };
    load();
    window.addEventListener('hrhub:refresh', load);
    return () => window.removeEventListener('hrhub:refresh', load);
  }, [countKey]);
  const tabs = useMemo(() => [
    { id: ALL, name: 'كل الشركات', n: companies.reduce((s, c) => s + c.n, 0) + none },
    ...companies,
    ...(none ? [{ id: NONE, name: 'بدون شركة', n: none }] : []),
  ], [companies, none]);
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium',
            value === t.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-background hover:border-emerald-400')}>
          {t.id !== ALL && t.id !== NONE && <Building2 className="h-3.5 w-3.5" />}
          {t.name}
          <span className={cn('rounded-full px-1.5 text-[11px] tabular', value === t.id ? 'bg-white/20' : 'bg-muted')}>{t.n}</span>
        </button>
      ))}
    </div>
  );
}

export function VehiclesSection({ canWrite }: { canWrite: boolean }) {
  const [company, setCompany] = useState(ALL);
  return (
    <div>
      <PageHeader title="السيارات" subtitle="سيارات كل شركة ومستنداتها — اختار الشركة لعرض سياراتها، وأي سيارة تضيفها جوه تبويب الشركة بتتسجل عليها" />
      <CompanyTabs countKey="vehicles" value={company} onChange={setCompany} />
      <VehiclesPanel key={company} canWrite={canWrite} company={company} />
    </div>
  );
}

export function CompanyContractsSection({ canWrite }: { canWrite: boolean }) {
  const [company, setCompany] = useState(ALL);
  return (
    <div>
      <PageHeader title="عقود الشركة" subtitle="عقود كل شركة (توريد، خدمات، إيجار...) — اختار الشركة لعرض عقودها، وأي عقد تضيفه جوه تبويب الشركة بيتسجل عليها" />
      <CompanyTabs countKey="contracts" value={company} onChange={setCompany} />
      <CompanyContractsPanel key={company} canWrite={canWrite} company={company} />
    </div>
  );
}
