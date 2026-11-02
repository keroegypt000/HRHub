'use client';

// التنبيهات والنفاذ: الجوازات + السيارات (رخصة/تأمين/فحص) + عقود الشركة
// ملخص تنبيهات مباشر من /api/alerts + إدارة كاملة لكل فئة
import { useEffect, useState } from 'react';
import { api, fmtDate, fmtKWD } from '@/lib/client';
import { PageHeader } from '@/components/hrhub/common';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BellRing, CalendarClock, Car, FileSignature, ShieldAlert, Plane, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpiryAlert {
  id: string; kind: string; kindAr: string; title: string; subtitle: string;
  expiry: string; daysLeft: number; level: 'expired' | 'd30' | 'd60' | 'd90';
}

interface AlertsData {
  alerts: ExpiryAlert[];
  summary: { expired: number; d30: number; d60: number; d90: number };
  total: number;
}

/** شارة حالة النفاذ حسب تاريخ الانتهاء */
export function ExpiryBadge({ expiry }: { expiry?: string | null }) {
  if (!expiry) return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">غير مسجل</Badge>;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 3600_000));
  if (days < 0) return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 font-bold">منتهي منذ {Math.abs(days)} يوم</Badge>;
  if (days <= 30) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold">ينتهي خلال {days} يوم</Badge>;
  if (days <= 60) return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">خلال {days} يومًا</Badge>;
  if (days <= 90) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">خلال {days} يومًا</Badge>;
  return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">ساري ({fmtDate(expiry)})</Badge>;
}

function SummaryCard({ title, value, icon: Icon, tone }: {
  title: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', tone)}>
          <Icon className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-extrabold tabular leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AlertsSection({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<AlertsData | null>(null);

  useEffect(() => {
    api<AlertsData>('/api/alerts').then(setData).catch(() => {});
    const onRefresh = () => api<AlertsData>('/api/alerts').then(setData).catch(() => {});
    window.addEventListener('hrhub:refresh', onRefresh);
    return () => window.removeEventListener('hrhub:refresh', onRefresh);
  }, []);

  const s = data?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title="التنبيهات والنفاذ"
        subtitle="جوازات السفر والإقامات ومستندات السيارات وعقود الشركة — تنبيه تلقائي قبل الانتهاء بـ30/60/90 يومًا"
        actions={<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><BellRing className="h-3.5 w-3.5 ml-1" /> فحص تلقائي عند كل فتح</Badge>}
      />

      {/* ملخص التنبيهات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard title="منتهية الآن (تتطلب إجراءً)" value={s?.expired ?? 0} icon={ShieldAlert} tone="bg-red-100 text-red-700" />
        <SummaryCard title="تنتهي خلال 30 يومًا" value={s?.d30 ?? 0} icon={CalendarClock} tone="bg-red-50 text-red-600" />
        <SummaryCard title="تنتهي خلال 60 يومًا" value={s?.d60 ?? 0} icon={CalendarClock} tone="bg-amber-100 text-amber-700" />
        <SummaryCard title="تنتهي خلال 90 يومًا" value={s?.d90 ?? 0} icon={CalendarClock} tone="bg-yellow-50 text-yellow-700" />
      </div>

      {/* قائمة التنبيهات المجمعة */}
      {data && data.alerts.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm font-bold mb-3 flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-600" />
              العناصر القريبة من النفاذ أو المنتهية ({data.total})
            </p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {data.alerts.slice(0, 30).map((a) => (
                <div key={`${a.kind}-${a.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <Badge variant="outline" className={cn('shrink-0', a.level === 'expired' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-50 text-amber-800 border-amber-200')}>
                    {a.kindAr}
                  </Badge>
                  <span className="font-medium">{a.title}</span>
                  {a.subtitle && <span className="text-xs text-muted-foreground">{a.subtitle}</span>}
                  <span className="flex-1" />
                  <span className="tabular text-xs text-muted-foreground">{fmtDate(a.expiry)}</span>
                  <ExpiryBadge expiry={a.expiry} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* إدارة الفئات الثلاث */}
      <Tabs defaultValue="passports" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="passports" className="gap-1.5"><Plane className="h-4 w-4" /> الجوازات</TabsTrigger>
          <TabsTrigger value="iqamas" className="gap-1.5"><CreditCard className="h-4 w-4" /> الإقامات</TabsTrigger>
          <TabsTrigger value="vehicles" className="gap-1.5"><Car className="h-4 w-4" /> السيارات</TabsTrigger>
          <TabsTrigger value="company-contracts" className="gap-1.5"><FileSignature className="h-4 w-4" /> عقود الشركة</TabsTrigger>
        </TabsList>

        {/* الجوازات */}
        <TabsContent value="passports">
          <CrudPanel<Record<string, unknown> & { id: string }>
            entityPath="/api/passports"
            entityLabel="جواز"
            title="جوازات السفر"
            subtitle="تنبيه انتهاء الجوازات — للموظفين أو لغيرهم من أفراد العائلة إن لزم"
            canWrite={canWrite}
            searchPlaceholder="بحث برقم الجواز أو الاسم..."
            columns={[
              { key: 'holder', header: 'صاحب الجواز', render: (r) => <span className="font-medium">{String(r.holderName)}</span> },
              { key: 'passportNo', header: 'رقم الجواز', render: (r) => <span className="font-mono">{String(r.passportNo)}</span> },
              { key: 'employee', header: 'موظف مرتبط', render: (r) => (r.employee as { name: string; code: string } | null) ? `${(r.employee as { name: string; code: string }).name}` : '—', hideOnMobile: true },
              { key: 'nationality', header: 'الجنسية', render: (r) => String(r.nationality || '—'), hideOnMobile: true },
              { key: 'expiry', header: 'تاريخ الانتهاء', render: (r) => <span className="tabular">{fmtDate(r.expiryDate as string)}</span> },
              { key: 'status', header: 'الحالة', render: (r) => <ExpiryBadge expiry={r.expiryDate as string} /> },
            ]}
            fields={[
              { key: 'holderName', label: 'اسم صاحب الجواز', type: 'text', required: true },
              { key: 'employeeId', label: 'موظف مرتبط (اختياري)', type: 'select' },
              { key: 'passportNo', label: 'رقم الجواز', type: 'text', required: true },
              { key: 'nationality', label: 'الجنسية', type: 'text' },
              { key: 'issueDate', label: 'تاريخ الإصدار', type: 'date' },
              { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
              { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
            ]}
            defaultValues={{}}
            loadOptions={optionLoaders.employees}
            rowToForm={(r) => ({
              ...r,
              issueDate: r.issueDate ? fmtDate(r.issueDate as string) : '',
              expiryDate: r.expiryDate ? fmtDate(r.expiryDate as string) : '',
              employeeId: (r.employee as { id: string } | null | undefined)?.id || '',
            })}
          />
        </TabsContent>

        {/* الإقامات */}
        <TabsContent value="iqamas">
          <CrudPanel<Record<string, unknown> & { id: string }>
            entityPath="/api/iqamas"
            entityLabel="إقامة"
            title="الإقامات"
            subtitle="تنبيه انتهاء إقامات المقيمين — تجديد قبل النفاذ لتفادي الغرامات"
            canWrite={canWrite}
            searchPlaceholder="بحث برقم الإقامة أو الاسم أو الكفيل..."
            columns={[
              { key: 'holder', header: 'صاحب الإقامة', render: (r) => <span className="font-medium">{String(r.holderName)}</span> },
              { key: 'iqamaNo', header: 'رقم الإقامة', render: (r) => <span className="font-mono">{String(r.iqamaNo)}</span> },
              { key: 'employee', header: 'موظف مرتبط', render: (r) => (r.employee as { name: string; code: string } | null) ? `${(r.employee as { name: string; code: string }).name}` : '—', hideOnMobile: true },
              { key: 'profession', header: 'المهنة', render: (r) => String(r.profession || '—'), hideOnMobile: true },
              { key: 'expiry', header: 'تاريخ الانتهاء', render: (r) => <span className="tabular">{fmtDate(r.expiryDate as string)}</span> },
              { key: 'status', header: 'الحالة', render: (r) => <ExpiryBadge expiry={r.expiryDate as string} /> },
            ]}
            fields={[
              { key: 'holderName', label: 'اسم صاحب الإقامة', type: 'text', required: true },
              { key: 'employeeId', label: 'موظف مرتبط (اختياري)', type: 'select' },
              { key: 'iqamaNo', label: 'رقم الإقامة', type: 'text', required: true },
              { key: 'nationality', label: 'الجنسية', type: 'text' },
              { key: 'profession', label: 'المهنة', type: 'text' },
              { key: 'sponsor', label: 'الكفيل', type: 'text' },
              { key: 'issueDate', label: 'تاريخ الإصدار', type: 'date' },
              { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
              { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
            ]}
            defaultValues={{}}
            loadOptions={optionLoaders.employees}
            rowToForm={(r) => ({
              ...r,
              issueDate: r.issueDate ? fmtDate(r.issueDate as string) : '',
              expiryDate: r.expiryDate ? fmtDate(r.expiryDate as string) : '',
              employeeId: (r.employee as { id: string } | null | undefined)?.id || '',
            })}
          />
        </TabsContent>

        {/* السيارات */}
        <TabsContent value="vehicles">
          <CrudPanel<Record<string, unknown> & { id: string }>
            entityPath="/api/vehicles"
            entityLabel="مركبة"
            title="السيارات ومستنداتها"
            subtitle="رخصة السير والتأمين والفحص الدوري — تنبيه لكل مستند على حدة"
            canWrite={canWrite}
            searchPlaceholder="بحث برقم اللوحة أو السائق..."
            columns={[
              { key: 'plate', header: 'اللوحة', render: (r) => <span className="font-mono font-bold">{String(r.plateNo)}</span> },
              { key: 'make', header: 'الماركة/الموديل', render: (r) => `${r.make || ''} ${r.model || ''}`.trim() || '—' },
              { key: 'driver', header: 'السائق', render: (r) => String(r.driverName || '—'), hideOnMobile: true },
              { key: 'license', header: 'رخصة السير', render: (r) => <ExpiryBadge expiry={r.licenseExpiry as string | null} /> },
              { key: 'insurance', header: 'التأمين', render: (r) => <ExpiryBadge expiry={r.insuranceExpiry as string | null} /> },
              { key: 'inspection', header: 'الفحص الدوري', render: (r) => <ExpiryBadge expiry={r.inspectionExpiry as string | null} />, hideOnMobile: true },
            ]}
            fields={[
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
            defaultValues={{}}
            rowToForm={(r) => ({
              ...r,
              licenseExpiry: r.licenseExpiry ? fmtDate(r.licenseExpiry as string) : '',
              insuranceExpiry: r.insuranceExpiry ? fmtDate(r.insuranceExpiry as string) : '',
              inspectionExpiry: r.inspectionExpiry ? fmtDate(r.inspectionExpiry as string) : '',
            })}
          />
        </TabsContent>

        {/* عقود الشركة */}
        <TabsContent value="company-contracts">
          <CrudPanel<Record<string, unknown> & { id: string }>
            entityPath="/api/company-contracts"
            entityLabel="عقد شركة"
            title="عقود الشركة"
            subtitle="عقود التوريد والخدمات والإيجار — تنبيه قبل الانتهاء للتجديد في وقته"
            canWrite={canWrite}
            searchPlaceholder="بحث باسم العقد أو الطرف الآخر..."
            columns={[
              { key: 'name', header: 'العقد', render: (r) => <span className="font-medium">{String(r.name)}</span> },
              { key: 'counterparty', header: 'الطرف الآخر', render: (r) => String(r.counterparty || '—') },
              { key: 'type', header: 'النوع', render: (r) => String(r.type || '—'), hideOnMobile: true },
              { key: 'value', header: 'القيمة (د.ك)', render: (r) => <span className="tabular">{r.value ? fmtKWD(r.value as number) : '—'}</span>, hideOnMobile: true },
              { key: 'period', header: 'الفترة', render: (r) => <span className="tabular text-xs">{fmtDate(r.startDate as string | null)} → {fmtDate(r.endDate as string)}</span> },
              { key: 'status', header: 'النفاذ', render: (r) => <ExpiryBadge expiry={r.endDate as string} /> },
            ]}
            fields={[
              { key: 'name', label: 'اسم/وصف العقد', type: 'text', required: true, span: 2 },
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
            defaultValues={{ renewal: true }}
            rowToForm={(r) => ({
              ...r,
              startDate: r.startDate ? fmtDate(r.startDate as string) : '',
              endDate: r.endDate ? fmtDate(r.endDate as string) : '',
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
