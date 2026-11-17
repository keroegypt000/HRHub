'use client';

// الكروت الصحية + التأمين الصحي + تأمين الحوادث وإصابات العمل + مكتبة نماذج الشؤون
import { api, fmtDate, fmtKWD } from '@/lib/client';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { PageHeader } from '@/components/hrhub/common';
import { ExpiryBadge } from '@/components/hrhub/sections/alerts';
import { openStoredFile } from '@/components/hrhub/file-field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeartPulse, ShieldPlus, Ambulance, FileDown } from 'lucide-react';

type Row = Record<string, unknown> & { id: string };
type Emp = { id: string; name: string; code: string; department?: { id: string; name: string } | null } | null;

const empCell = (r: Row) => {
  const e = r.employee as Emp;
  return e ? <div><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.code}{e.department ? ` · ${e.department.name}` : ''}</p></div> : '—';
};
const dateForm = (v: unknown) => (v ? fmtDate(v as string) : '');
const fileCell = (r: Row) => r.fileId
  ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openStoredFile(String(r.fileId))}><FileDown className="h-3.5 w-3.5" /> فتح</Button>
  : <span className="text-muted-foreground">—</span>;

// ============================================================
// الكروت الصحية
// ============================================================
export function HealthCardsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <div>
      <PageHeader title="الكروت الصحية" subtitle="الشهادات الصحية للعاملين (إن وجدت) — تنبيه تلقائي قبل الانتهاء بـ30/60/90 يومًا" />
      <CrudPanel<Row>
        entityPath="/api/health-cards"
        entityLabel="كرت صحي"
        title="الكروت الصحية"
        subtitle="الأقرب انتهاءً يظهر أولًا"
        canWrite={canWrite}
        searchPlaceholder="بحث برقم الكرت أو الجهة..."
        columns={[
          { key: 'employee', header: 'الموظف', render: empCell },
          { key: 'cardNo', header: 'رقم الكرت', render: (r) => <span className="font-mono">{String(r.cardNo || '—')}</span> },
          { key: 'issuer', header: 'الجهة المصدرة', render: (r) => String(r.issuer || '—'), hideOnMobile: true },
          { key: 'expiry', header: 'تاريخ الانتهاء', render: (r) => <span className="tabular">{fmtDate(r.expiryDate as string)}</span> },
          { key: 'status', header: 'الحالة', render: (r) => <ExpiryBadge expiry={r.expiryDate as string} /> },
          { key: 'file', header: 'الصورة', render: fileCell, hideOnMobile: true },
        ]}
        fields={[
          { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
          { key: 'cardNo', label: 'رقم الكرت', type: 'text' },
          { key: 'issuer', label: 'الجهة المصدرة', type: 'text', placeholder: 'وزارة الصحة / البلدية' },
          { key: 'issueDate', label: 'تاريخ الإصدار', type: 'date' },
          { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
          { key: 'fileId', label: 'صورة الكرت', type: 'file', ownerTag: 'health_card' },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{}}
        loadOptions={optionLoaders.employees}
        rowToForm={(r) => ({ ...r, issueDate: dateForm(r.issueDate), expiryDate: dateForm(r.expiryDate), employeeId: (r.employee as Emp)?.id || '' })}
      />
    </div>
  );
}

// ============================================================
// التأمين الصحي + تأمين الحوادث وإصابات العمل + سجل الإصابات
// ============================================================
function InsurancePanel({ kind, canWrite }: { kind: 'health' | 'accident'; canWrite: boolean }) {
  const health = kind === 'health';
  return (
    <CrudPanel<Row>
      entityPath="/api/insurances"
      entityLabel={health ? 'تأمين صحي' : 'تأمين حوادث'}
      title={health ? 'وثائق التأمين الصحي' : 'وثائق تأمين الحوادث وإصابات العمل'}
      subtitle={health ? 'شركة التأمين والفئة والتغطية والقسط لكل موظف' : 'تغطية الموظف ضد الحوادث وإصابات العمل'}
      canWrite={canWrite}
      searchPlaceholder="بحث بشركة التأمين أو رقم الوثيقة..."
      filterRows={(rows) => rows.filter((r) => r.kind === kind)}
      columns={[
        { key: 'employee', header: 'الموظف', render: empCell },
        { key: 'provider', header: 'شركة التأمين', render: (r) => <span className="font-medium">{String(r.provider)}</span> },
        { key: 'policyNo', header: 'رقم الوثيقة', render: (r) => <span className="font-mono">{String(r.policyNo || '—')}</span>, hideOnMobile: true },
        { key: 'category', header: 'الفئة', render: (r) => String(r.category || '—'), hideOnMobile: true },
        ...(health ? [{ key: 'family', header: 'تشمل الأسرة', render: (r: Row) => (r.includesFamily ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700">نعم</Badge> : 'لا'), hideOnMobile: true }] : []),
        { key: 'premium', header: 'القسط السنوي', render: (r) => <span className="tabular">{fmtKWD(Number(r.premium || 0))}</span> },
        { key: 'expiry', header: 'تنتهي', render: (r) => (r.expiryDate ? <span className="tabular">{fmtDate(r.expiryDate as string)}</span> : '—') },
        { key: 'status', header: 'الحالة', render: (r) => (r.expiryDate ? <ExpiryBadge expiry={r.expiryDate as string} /> : '—') },
        { key: 'file', header: 'الوثيقة', render: fileCell, hideOnMobile: true },
      ]}
      fields={[
        { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
        { key: 'provider', label: 'شركة التأمين', type: 'text', required: true },
        { key: 'policyNo', label: health ? 'رقم الوثيقة / البطاقة' : 'رقم الوثيقة', type: 'text' },
        { key: 'category', label: health ? 'الفئة (A / B / C ...)' : 'نوع التغطية', type: 'text' },
        { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
        { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', hint: 'يظهر في التنبيهات قبل الانتهاء' },
        { key: 'premium', label: 'القسط السنوي (د.ك)', type: 'number' },
        { key: 'coverage', label: 'حد التغطية (د.ك)', type: 'number' },
        ...(health ? [{ key: 'includesFamily', label: 'تشمل أفراد الأسرة', type: 'switch' as const }] : []),
        { key: 'fileId', label: 'صورة الوثيقة', type: 'file', ownerTag: 'insurance_document' },
        { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ kind, premium: 0, includesFamily: false }}
      loadOptions={optionLoaders.employees}
      rowToForm={(r) => ({ ...r, startDate: dateForm(r.startDate), expiryDate: dateForm(r.expiryDate), employeeId: (r.employee as Emp)?.id || '' })}
    />
  );
}

const INJURY_STATUS: Record<string, string> = { open: 'مفتوحة', closed: 'مغلقة' };

function InjuriesPanel({ canWrite }: { canWrite: boolean }) {
  return (
    <CrudPanel<Row>
      entityPath="/api/work-injuries"
      entityLabel="إصابة عمل"
      title="سجل الحوادث وإصابات العمل"
      subtitle="تاريخ ومكان ووصف الإصابة، أيام الانقطاع، التعويض، والتقرير الطبي"
      canWrite={canWrite}
      searchPlaceholder="بحث بالوصف أو المكان أو نوع الإصابة..."
      columns={[
        { key: 'date', header: 'التاريخ', render: (r) => <span className="tabular">{fmtDate(r.date as string)}</span> },
        { key: 'employee', header: 'الموظف', render: empCell },
        { key: 'injuryType', header: 'نوع الإصابة', render: (r) => String(r.injuryType || '—') },
        { key: 'place', header: 'المكان', render: (r) => String(r.place || '—'), hideOnMobile: true },
        { key: 'daysOff', header: 'أيام الانقطاع', render: (r) => <span className="tabular">{Number(r.daysOff || 0)}</span> },
        { key: 'compensation', header: 'التعويض', render: (r) => <span className="tabular">{fmtKWD(Number(r.compensation || 0))}</span>, hideOnMobile: true },
        { key: 'reported', header: 'تم الإبلاغ', render: (r) => (r.reported ? 'نعم' : 'لا'), hideOnMobile: true },
        { key: 'status', header: 'الحالة', render: (r) => <Badge variant="outline" className={r.status === 'closed' ? 'bg-slate-50' : 'bg-amber-50 text-amber-800'}>{INJURY_STATUS[String(r.status)] || String(r.status)}</Badge> },
        { key: 'file', header: 'التقرير', render: fileCell, hideOnMobile: true },
      ]}
      fields={[
        { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
        { key: 'date', label: 'تاريخ الإصابة', type: 'date', required: true },
        { key: 'injuryType', label: 'نوع الإصابة', type: 'text', placeholder: 'كسر / جرح / حرق / سقوط ...' },
        { key: 'place', label: 'مكان الحادث', type: 'text' },
        { key: 'description', label: 'وصف الحادث', type: 'textarea', span: 2, required: true },
        { key: 'daysOff', label: 'أيام الانقطاع عن العمل', type: 'number' },
        { key: 'compensation', label: 'التعويض (د.ك)', type: 'number' },
        { key: 'insuranceId', label: 'وثيقة التأمين', type: 'select' },
        { key: 'reported', label: 'تم إبلاغ الجهات المختصة', type: 'switch' },
        { key: 'status', label: 'الحالة', type: 'select', options: [{ value: 'open', label: 'مفتوحة' }, { value: 'closed', label: 'مغلقة' }] },
        { key: 'fileId', label: 'التقرير الطبي', type: 'file', ownerTag: 'injury_report' },
        { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ status: 'open', daysOff: 0, compensation: 0, reported: false }}
      loadOptions={async () => {
        const [emps, ins] = await Promise.all([
          optionLoaders.employees(),
          api<{ rows: { id: string; provider: string; policyNo?: string | null; kind: string; employee?: { name: string } | null }[] }>('/api/insurances?limit=1000').catch(() => ({ rows: [] })),
        ]);
        return {
          ...emps,
          insuranceId: ins.rows.map((i) => ({ value: i.id, label: `${i.kind === 'accident' ? 'حوادث' : 'صحي'} — ${i.provider}${i.policyNo ? ` (${i.policyNo})` : ''}${i.employee ? ` — ${i.employee.name}` : ''}` })),
        };
      }}
      rowToForm={(r) => ({ ...r, date: dateForm(r.date), employeeId: (r.employee as Emp)?.id || '', insuranceId: (r.insurance as { id: string } | null)?.id || '' })}
    />
  );
}

export function InsuranceSection({ canWrite, canWriteInjuries }: { canWrite: boolean; canWriteInjuries: boolean }) {
  return (
    <div>
      <PageHeader title="التأمين وإصابات العمل" subtitle="التأمين الصحي للموظفين، وتأمين الحوادث وإصابات العمل، وسجل الإصابات — مع تنبيه قبل انتهاء الوثائق" />
      <Tabs defaultValue="health" dir="rtl">
        <TabsList className="mb-3 h-auto flex-wrap">
          <TabsTrigger value="health" className="gap-1.5"><HeartPulse className="h-4 w-4" /> التأمين الصحي</TabsTrigger>
          <TabsTrigger value="accident" className="gap-1.5"><ShieldPlus className="h-4 w-4" /> تأمين الحوادث وإصابات العمل</TabsTrigger>
          <TabsTrigger value="injuries" className="gap-1.5"><Ambulance className="h-4 w-4" /> سجل الإصابات</TabsTrigger>
        </TabsList>
        <TabsContent value="health"><InsurancePanel kind="health" canWrite={canWrite} /></TabsContent>
        <TabsContent value="accident"><InsurancePanel kind="accident" canWrite={canWrite} /></TabsContent>
        <TabsContent value="injuries"><InjuriesPanel canWrite={canWriteInjuries} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// مكتبة النماذج (نماذج الشؤون / الهيئة العامة للقوى العاملة)
// ============================================================
export const FORM_CATEGORIES = [
  'إذن عمل جديد', 'تجديد إذن عمل', 'تحويل إذن عمل', 'إلغاء إذن عمل', 'شهادات ورواتب',
  'إقامات ووزارة الداخلية', 'التأمينات الاجتماعية', 'عقود عمل', 'أخرى',
];

export function FormsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <div>
      <PageHeader title="نماذج الشؤون" subtitle="ارفع نماذج الهيئة العامة للقوى العاملة والجهات الحكومية مرة واحدة، وحمّلها أو اطبعها في أي وقت" />
      <CrudPanel<Row>
        entityPath="/api/forms"
        entityLabel="نموذج"
        title="مكتبة النماذج"
        subtitle="PDF أو Word أو صورة — حتى 10 ميجا للملف"
        canWrite={canWrite}
        searchPlaceholder="بحث باسم النموذج أو التصنيف..."
        columns={[
          { key: 'title', header: 'اسم النموذج', render: (r) => <span className="font-medium">{String(r.title)}</span> },
          { key: 'category', header: 'التصنيف', render: (r) => (r.category ? <Badge variant="outline">{String(r.category)}</Badge> : '—') },
          { key: 'fileName', header: 'الملف', render: (r) => <span className="text-xs text-muted-foreground">{String(r.fileName || '—')}</span>, hideOnMobile: true },
          { key: 'createdAt', header: 'أضيف في', render: (r) => <span className="tabular text-xs">{fmtDate(r.createdAt as string)}</span>, hideOnMobile: true },
          { key: '__open', header: 'تحميل', render: (r) => <Button variant="outline" size="sm" className="h-7 text-xs text-emerald-700" onClick={() => openStoredFile(String(r.fileId))}><FileDown className="h-3.5 w-3.5" /> فتح / تحميل</Button> },
        ]}
        fields={[
          { key: 'title', label: 'اسم النموذج', type: 'text', required: true, placeholder: 'مثال: طلب إذن عمل جديد' },
          { key: 'category', label: 'التصنيف', type: 'select', options: FORM_CATEGORIES.map((c) => ({ value: c, label: c })) },
          { key: 'fileId', label: 'ملف النموذج', type: 'file', ownerTag: 'labor_form', fileNameKey: 'fileName', required: true, span: 2 },
          { key: 'notes', label: 'ملاحظات / طريقة التعبئة', type: 'textarea', span: 2 },
        ]}
        defaultValues={{}}
      />
    </div>
  );
}
