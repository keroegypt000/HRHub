'use client';

// العُهد والحوافز/الجزاءات — شاشتان بنفس نمط باقي النظام (CrudPanel)
import { useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate } from '@/lib/client';
import { StatusBadge } from '@/components/hrhub/common';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { Column } from '@/components/hrhub/data-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PackageCheck } from 'lucide-react';

const EMP = (r: { employee?: { name: string; code: string; department?: { name: string } | null } | null }) => (
  <div><p className="font-medium">{r.employee?.name || '—'}</p><p className="text-xs text-muted-foreground tabular">{r.employee?.code} · {r.employee?.department?.name || '—'}</p></div>
);

// ===================== العُهد =====================
export const CUSTODY_CATEGORIES = [
  { value: 'laptop', label: 'لابتوب / كمبيوتر' }, { value: 'phone', label: 'هاتف / شريحة' },
  { value: 'vehicle', label: 'سيارة' }, { value: 'tools', label: 'أدوات / معدات' },
  { value: 'uniform', label: 'زي موحد' }, { value: 'keys', label: 'مفاتيح' },
  { value: 'card', label: 'بطاقة / كارت دخول' }, { value: 'other', label: 'أخرى' },
];
const CUSTODY_STATUS = [
  { value: 'issued', label: 'مسلَّمة للموظف' }, { value: 'returned', label: 'مُستلمة منه' },
  { value: 'lost', label: 'مفقودة' }, { value: 'damaged', label: 'تالفة' },
];
const catLabel = (v: string) => CUSTODY_CATEGORIES.find((c) => c.value === v)?.label || v;

interface CustodyRow extends Record<string, unknown> {
  id: string; itemName: string; category: string; serialNo?: string | null; quantity: number; value: number;
  issuedAt: string; returnedAt?: string | null; status: string; deductionAmount: number; notes?: string | null;
  employeeId: string; employee?: { name: string; code: string; department?: { name: string } | null } | null;
}

export function CustodySection({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState('issued');
  const [reloadKey, setReloadKey] = useState(0);
  const filterRows = useMemo(() => (rows: CustodyRow[]) => rows.filter((r) => status === 'all' || r.status === status), [status]);

  const receive = async (r: CustodyRow) => {
    try {
      await api(`/api/custody/${r.id}`, { method: 'PUT', body: JSON.stringify({ status: 'returned' }) });
      toast.success(`استُلمت العهدة: ${r.itemName}`);
      setReloadKey((k) => k + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الاستلام'); }
  };

  const columns: Column<CustodyRow>[] = [
    { key: 'emp', header: 'الموظف', render: EMP },
    { key: 'item', header: 'العهدة', render: (r) => <div><p className="font-medium">{r.itemName}{r.quantity > 1 ? ` ×${r.quantity}` : ''}</p><p className="text-xs text-muted-foreground">{catLabel(r.category)}{r.serialNo ? ` · ${r.serialNo}` : ''}</p></div> },
    { key: 'value', header: 'القيمة', render: (r) => <span className="tabular">{fmtKWD(r.value)}</span> },
    { key: 'issued', header: 'التسليم', render: (r) => <span className="tabular">{fmtDate(r.issuedAt)}</span>, hideOnMobile: true },
    { key: 'returned', header: 'الاستلام', render: (r) => <span className="tabular">{r.returnedAt ? fmtDate(r.returnedAt) : '—'}</span>, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <CrudPanel<CustodyRow>
      key={reloadKey}
      entityPath="/api/custody"
      entityLabel="عهدة"
      title="العُهد"
      subtitle="أصول الشركة المسلَّمة للموظفين — العهدة غير المُستلمة تُخصم تلقائيًا في تسوية نهاية الخدمة"
      canWrite={canWrite}
      searchPlaceholder="بحث باسم العهدة أو الرقم التسلسلي..."
      columns={columns}
      filterRows={filterRows}
      filtersBar={
        <Select value={status} onValueChange={setStatus} dir="rtl">
          <SelectTrigger dir="rtl" className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {CUSTODY_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      }
      rowActions={(r) => canWrite && r.status === 'issued' ? (
        <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => receive(r)}><PackageCheck className="h-4 w-4" /> استلام</Button>
      ) : null}
      fields={[
        { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
        { key: 'itemName', label: 'اسم العهدة', type: 'text', required: true },
        { key: 'category', label: 'النوع', type: 'select', options: CUSTODY_CATEGORIES },
        { key: 'serialNo', label: 'الرقم التسلسلي / اللوحة', type: 'text' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'value', label: 'القيمة (د.ك)', type: 'number', hint: 'تُخصم في التسوية إن لم تُسلَّم' },
        { key: 'issuedAt', label: 'تاريخ التسليم', type: 'date', required: true },
        { key: 'status', label: 'الحالة', type: 'select', options: CUSTODY_STATUS },
        { key: 'returnedAt', label: 'تاريخ الاستلام', type: 'date' },
        { key: 'deductionAmount', label: 'مبلغ الخصم عند الفقد/التلف', type: 'number', hint: 'فارغ = القيمة كاملة' },
        { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ category: 'other', quantity: 1, value: 0, status: 'issued', deductionAmount: 0, issuedAt: new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 10) }}
      loadOptions={optionLoaders.employees}
      rowToForm={(r) => ({
        ...r, issuedAt: r.issuedAt ? fmtDate(r.issuedAt) : '', returnedAt: r.returnedAt ? fmtDate(r.returnedAt) : '',
      })}
    />
  );
}

// ===================== الحوافز والجزاءات =====================
const ADJ_CATEGORIES = [
  { value: 'bonus', label: 'مكافأة' }, { value: 'incentive', label: 'حافز' }, { value: 'commission', label: 'عمولة' },
  { value: 'allowance', label: 'بدل مؤقت' }, { value: 'penalty', label: 'جزاء' }, { value: 'deduction', label: 'خصم' },
  { value: 'other', label: 'أخرى' },
];
const adjLabel = (v: string) => ADJ_CATEGORIES.find((c) => c.value === v)?.label || v;

interface AdjustmentRow extends Record<string, unknown> {
  id: string; employeeId: string; type: string; category: string; name: string; amount: number;
  month: string; untilMonth?: string | null; notes?: string | null;
  employee?: { name: string; code: string; department?: { name: string } | null } | null;
}

export function AdjustmentsSection({ canWrite }: { canWrite: boolean }) {
  const thisMonth = new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 7);
  const columns: Column<AdjustmentRow>[] = [
    { key: 'emp', header: 'الموظف', render: EMP },
    { key: 'name', header: 'البند', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{adjLabel(r.category)}</p></div> },
    { key: 'amount', header: 'المبلغ', render: (r) => <span className={`tabular font-bold ${r.type === 'deduction' ? 'text-red-700' : 'text-emerald-700'}`}>{r.type === 'deduction' ? '−' : '+'} {fmtKWD(r.amount)}</span> },
    { key: 'month', header: 'الفترة', render: (r) => <span className="tabular">{r.month}{r.untilMonth && r.untilMonth !== r.month ? ` → ${r.untilMonth}` : ''}</span> },
    { key: 'kind', header: '', render: (r) => r.untilMonth && r.untilMonth !== r.month ? <Badge variant="outline">شهري متكرر</Badge> : <Badge variant="outline">مرة واحدة</Badge>, hideOnMobile: true },
  ];
  return (
    <CrudPanel<AdjustmentRow>
      entityPath="/api/adjustments"
      entityLabel="بند"
      title="الحوافز والجزاءات"
      subtitle="مكافآت وحوافز وعمولات وجزاءات تُضاف تلقائيًا لقسيمة الشهر — أعد حساب الفترة بعد الإضافة"
      canWrite={canWrite}
      searchPlaceholder="بحث بالوصف..."
      columns={columns}
      fields={[
        { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
        { key: 'type', label: 'النوع', type: 'select', required: true, options: [{ value: 'earning', label: 'إضافة للراتب (+)' }, { value: 'deduction', label: 'خصم من الراتب (−)' }] },
        { key: 'category', label: 'التصنيف', type: 'select', options: ADJ_CATEGORIES },
        { key: 'name', label: 'الوصف (يظهر في القسيمة)', type: 'text', required: true },
        { key: 'amount', label: 'المبلغ (د.ك)', type: 'number', required: true },
        { key: 'month', label: 'الشهر (YYYY-MM)', type: 'text', required: true, hint: 'مثال: 2026-11' },
        { key: 'untilMonth', label: 'يتكرر حتى شهر (اختياري)', type: 'text', hint: 'فارغ = مرة واحدة فقط' },
        { key: 'notes', label: 'ملاحظات / سبب الجزاء', type: 'textarea', span: 2 },
      ]}
      defaultValues={{ type: 'earning', category: 'bonus', month: thisMonth }}
      loadOptions={optionLoaders.employees}
      rowToForm={(r) => ({ ...r, untilMonth: r.untilMonth || '' })}
    />
  );
}
