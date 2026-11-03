'use client';

// قسم الطلبات والموافقات: 3 تبويبات
// 1) طلبات الموظفين — 9 أنواع (إجازة/سلفة/شهادات/بذلة/أجهزة/أدوات/كارت/معدات) بسلسلة موافقات حتى 4 مستويات
// 2) إعدادات الموافقات — لكل وحدة × نوع طلب (مطابق لنموذج WORKFLOW APPROVAL SETTING)
// 3) السلف والقروض — تُخصم أقساطها تلقائيًا من الرواتب وتظهر في تسوية النهاية
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fmtKWD, STATUS_AR } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Check, X, Ban, Landmark, ClipboardList, Settings2, RefreshCw } from 'lucide-react';
import { REQUEST_TYPES, requestTypeLabel, parseSteps } from '@/lib/requests';
import { optionLoaders } from '@/components/hrhub/crud-panel';
import { cn } from '@/lib/utils';

// ===== 1) طلبات الموظفين =====
interface RequestRow extends Record<string, unknown> {
  id: string;
  employee?: { id: string; name: string; code: string; department?: { name: string } | null };
  type: string; status: string; currentStep: number;
  steps: string; payload?: string | null; unitKey?: string | null;
  createdAt: string; notes?: string | null;
}

function RequestsTab({ canWrite, meId, isAdmin, isHr }: { canWrite: boolean; meId: string; isAdmin: boolean; isHr: boolean }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ type: 'vacation', employeeId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await api<{ rows: RequestRow[] }>(`/api/requests${params}`);
      setRows(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await api('/api/requests', { method: 'POST', body: JSON.stringify(form) });
      toast.success('أُنشئ الطلب وبُنيت سلسلة الموافقات تلقائيًا');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإنشاء');
    }
  };

  const act = async (row: RequestRow, action: 'approve' | 'reject') => {
    try {
      await api(`/api/requests/${row.id}`, { method: 'POST', body: JSON.stringify({ action }) });
      toast.success(action === 'approve' ? 'تم اعتماد المستوى' : 'رُفض الطلب');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإجراء');
    }
  };

  const cancel = async (row: RequestRow) => {
    try {
      await api(`/api/requests/${row.id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
      toast.success('أُلغي الطلب');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإلغاء');
    }
  };

  /** هل يمكنني القرار على الطلب الآن؟ */
  const canDecide = (r: RequestRow): boolean => {
    if (r.status !== 'pending') return false;
    const steps = parseSteps(r.steps);
    const idx = steps.findIndex((s) => s.status === 'waiting');
    if (idx === -1) return false;
    return isAdmin || (isHr && !steps[idx].userId) || steps[idx].userId === meId;
  };

  const payloadText = (r: RequestRow): string => {
    try {
      const p = JSON.parse(r.payload || '{}') as Record<string, unknown>;
      const parts: string[] = [];
      if (p.fromDate) parts.push(`من ${fmtDate(String(p.fromDate))}`);
      if (p.toDate) parts.push(`إلى ${fmtDate(String(p.toDate))}`);
      if (p.days) parts.push(`${p.days} يوم`);
      if (p.amount) parts.push(`${fmtKWD(Number(p.amount))} د.ك`);
      if (p.installments) parts.push(`${p.installments} قسط`);
      if (p.description) parts.push(String(p.description));
      if (p.purpose) parts.push(String(p.purpose));
      return parts.join(' · ') || '—';
    } catch { return '—'; }
  };

  const columns: Column<RequestRow>[] = [
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-muted-foreground">{r.employee?.department?.name || r.unitKey || '—'}</p></div> },
    { key: 'type', header: 'نوع الطلب', render: (r) => <Badge variant="outline" className="font-normal">{requestTypeLabel(r.type)}</Badge> },
    { key: 'details', header: 'التفاصيل', render: (r) => <span className="text-sm">{payloadText(r)}</span>, hideOnMobile: true },
    { key: 'steps', header: 'سلسلة الموافقة', render: (r) => {
        const steps = parseSteps(r.steps);
        return (
          <div className="flex flex-wrap items-center gap-1">
            {steps.map((s, i) => (
              <span key={i} className={cn(
                'text-[11px] px-1.5 py-0.5 rounded border',
                s.status === 'approved' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                s.status === 'rejected' && 'bg-red-50 text-red-700 border-red-200',
                s.status === 'waiting' && i === steps.findIndex((x) => x.status === 'waiting') && r.status === 'pending' && 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse',
                s.status === 'waiting' && !(i === steps.findIndex((x) => x.status === 'waiting')) && 'bg-muted text-muted-foreground',
              )}>{s.name}</span>
            ))}
          </div>
        );
      }, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'date', header: 'التاريخ', render: (r) => <span className="tabular text-sm">{fmtDate(r.createdAt)}</span>, hideOnMobile: true },
    { key: 'actions', header: 'إجراءات', render: (r) => (
      <div className="flex gap-1">
        {canDecide(r) && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-emerald-700 border-emerald-300" onClick={() => act(r, 'approve')}>
              <Check className="h-3.5 w-3.5" /> اعتماد
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-200" onClick={() => act(r, 'reject')}>
              <X className="h-3.5 w-3.5" /> رفض
            </Button>
          </>
        )}
        {canWrite && r.status === 'pending' && (
          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => cancel(r)} title="إلغاء الطلب">
            <Ban className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    ) },
  ];

  const typeDef = REQUEST_TYPES.find((t) => t.value === form.type) || REQUEST_TYPES[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter} dir="rtl">
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">قيد الموافقة</SelectItem>
            <SelectItem value="approved">معتمدة</SelectItem>
            <SelectItem value="rejected">مرفوضة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> تحديث</Button>
        {canWrite && (
          <Button size="sm" className="ms-auto" onClick={() => { setForm({ type: 'vacation', employeeId: '' }); setOpen(true); }}>
            <Plus className="h-4 w-4" /> طلب جديد
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} emptyText="لا توجد طلبات" maxBodyHeight="55vh" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>طلب جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1.5">نوع الطلب</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} dir="rtl">
                <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">الموظف</Label>
              <EmpSelect value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} />
            </div>
            {typeDef.fields.includes('dateRange') && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="mb-1.5">من</Label><Input type="date" value={form.fromDate || ''} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></div>
                <div><Label className="mb-1.5">إلى</Label><Input type="date" value={form.toDate || ''} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></div>
              </div>
            )}
            {typeDef.fields.includes('amount') && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="mb-1.5">المبلغ (د.ك)</Label><Input type="number" step="any" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label className="mb-1.5">عدد الأقساط</Label><Input type="number" value={form.installments || ''} onChange={(e) => setForm({ ...form, installments: e.target.value })} /></div>
              </div>
            )}
            {(typeDef.fields.includes('description') || typeDef.fields.includes('purpose')) && (
              <div>
                <Label className="mb-1.5">{typeDef.fields.includes('purpose') ? 'الغرض' : 'الوصف / المواصفات'}</Label>
                <Textarea rows={2} value={form.description || form.purpose || ''} onChange={(e) => setForm({ ...form, description: e.target.value, purpose: e.target.value })} />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">تُبنى سلسلة الموافقات تلقائيًا من إعدادات وحدة الموظف — وإلا إعدادات «كل الوحدات» — وإلا الموارد البشرية.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create} disabled={!form.employeeId}>إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmpSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [emps, setEmps] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { optionLoaders.employees().then((o) => setEmps(o.employeeId || [])); }, []);
  return (
    <Select value={value} onValueChange={onChange} dir="rtl">
      <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
      <SelectContent>{emps.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

// ===== 2) إعدادات الموافقات =====
interface WorkflowConfigRow {
  id: string; unitKey: string; requestType: string;
  level1UserId: string | null; level2UserId: string | null; level3UserId: string | null; level4UserId: string | null;
  notifyEmail: string | null;
}

function WorkflowTab({ canWrite }: { canWrite: boolean }) {
  const [configs, setConfigs] = useState<WorkflowConfigRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('ALL');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ configs: WorkflowConfigRow[]; departments: { id: string; name: string }[]; users: { id: string; name: string; role: string }[] }>('/api/workflow');
      setConfigs(d.configs);
      setDepartments(d.departments);
      setUsers(d.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const forType = (type: string): WorkflowConfigRow | undefined =>
    configs.find((c) => c.unitKey === unit && c.requestType === type);

  const save = async (type: string, patch: Partial<WorkflowConfigRow>) => {
    const existing = forType(type);
    setSaving(type);
    try {
      await api('/api/workflow', {
        method: 'PUT',
        body: JSON.stringify({
          unitKey: unit, requestType: type, departmentId: departments.find((d) => d.name === unit)?.id || null,
          ...existing ? {
            level1UserId: existing.level1UserId, level2UserId: existing.level2UserId,
            level3UserId: existing.level3UserId, level4UserId: existing.level4UserId,
            notifyEmail: existing.notifyEmail,
          } : {},
          ...patch,
        }),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(null);
    }
  };

  const levelSelect = (type: string, level: 1 | 2 | 3 | 4) => {
    const cfg = forType(type);
    const val = cfg?.[`level${level}UserId` as 'level1UserId'] || '';
    return (
      <Select
        value={val || 'none'}
        disabled={!canWrite || saving === type}
        onValueChange={(v) => save(type, { [`level${level}UserId`]: v === 'none' ? null : v } as Partial<WorkflowConfigRow>)}
        dir="rtl"
      >
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— بدون —</SelectItem>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  const emailInput = (type: string) => {
    const cfg = forType(type);
    return (
      <Input
        className="h-8 text-xs" type="email" placeholder="notify@company.com"
        defaultValue={cfg?.notifyEmail || ''}
        disabled={!canWrite}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (cfg?.notifyEmail || '')) save(type, { notifyEmail: v || null });
        }}
      />
    );
  };

  const units = ['ALL', ...departments.map((d) => d.name)];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Label className="text-sm">الوحدة:</Label>
        <Select value={unit} onValueChange={setUnit} dir="rtl">
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {units.map((u) => <SelectItem key={u} value={u}>{u === 'ALL' ? 'كل الوحدات (افتراضي)' : u}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">اضبط حتى 4 مستويات موافقة لكل نوع طلب — تُطبق على وحدة الموظف أولًا ثم «كل الوحدات».</p>
      </div>

      {loading ? <Skeleton className="h-96" /> : (
        <DataTable<RequestType & Record<string, unknown>>
          columns={[
            { key: 'label', header: 'نوع الطلب', render: (t) => <span className="text-sm font-medium">{t.label}</span> },
            ...([1, 2, 3, 4] as const).map((lv) => ({
              key: `l${lv}`, header: `الموافقة ${lv}${lv > 1 ? ' (اختياري)' : ''}`, render: (t: RequestType) => levelSelect(t.value, lv),
            }) as Column<RequestType>),
            { key: 'email', header: 'إيميل الإشعار', render: (t: RequestType) => emailInput(t.value), hideOnMobile: true },
          ] as Column<RequestType>[]}
          rows={REQUEST_TYPES as unknown as (RequestType & Record<string, unknown>)[]}
          loading={false}
          emptyText="—"
        />
      )}
    </div>
  );
}

interface RequestType { value: string; label: string }

// ===== 3) السلف والقروض =====
interface LoanRow extends Record<string, unknown> {
  id: string; employee?: { id: string; name: string; code: string; department?: { name: string } | null };
  name: string; totalAmount: number; installmentsCount: number; monthlyDeduction: number;
  startDate: string; paidInstallments: number; paidAmount: number; status: string; notes?: string | null;
}

function LoansTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [summary, setSummary] = useState<{ count: number; active: number; totalAmount: number; outstanding: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', name: 'سلفة', totalAmount: '', installmentsCount: '6', monthlyDeduction: '', startDate: new Date().toISOString().slice(0, 10), notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ rows: LoanRow[]; summary: typeof summary }>('/api/loans');
      setRows(d.rows);
      setSummary(d.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await api('/api/loans', { method: 'POST', body: JSON.stringify(form) });
      toast.success('أُسجلت السلفة — سيُخصم القسط تلقائيًا من الرواتب');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  const payOne = async (r: LoanRow) => {
    try {
      await api(`/api/loans/${r.id}`, { method: 'POST', body: JSON.stringify({ action: 'pay', installments: 1 }) });
      toast.success('سُجل سداد قسط');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإجراء');
    }
  };

  const cancelLoan = async (r: LoanRow) => {
    try {
      await api(`/api/loans/${r.id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
      toast.success('أُلغيت السلفة — لن يُخصم منها بعد الآن');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإجراء');
    }
  };

  const columns: Column<LoanRow>[] = [
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-muted-foreground tabular">{r.employee?.code}</p></div> },
    { key: 'name', header: 'الوصف', render: (r) => r.name },
    { key: 'total', header: 'المبلغ', render: (r) => <span className="tabular font-bold">{fmtKWD(r.totalAmount)} د.ك</span> },
    { key: 'inst', header: 'الأقساط', render: (r) => <span className="tabular">{r.paidInstallments}/{r.installmentsCount} × {fmtKWD(r.monthlyDeduction)}</span> },
    { key: 'remaining', header: 'المتبقي', render: (r) => <span className="tabular">{fmtKWD(Math.max(0, r.totalAmount - r.paidAmount))} د.ك</span> },
    { key: 'start', header: 'بداية الخصم', render: (r) => <span className="tabular text-sm">{fmtDate(r.startDate)}</span>, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'actions', header: 'إجراءات', render: (r) => canWrite && r.status === 'active' ? (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7" onClick={() => payOne(r)} title="تسجيل سداد قسط">
          <Landmark className="h-3.5 w-3.5" /> سداد قسط
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => cancelLoan(r)} title="إلغاء">
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) : null },
  ];

  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['إجمالي القروض', summary.count], ['قروض نشطة', summary.active],
            ['إجمالي المبالغ', `${fmtKWD(summary.totalAmount)} د.ك`], ['مبالغ معلّقة', `${fmtKWD(summary.outstanding)} د.ك`]] as [string, string | number][]).map(([k, v]) => (
            <Card key={k} className="border"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-lg font-extrabold tabular">{v}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> تحديث</Button>
        {canWrite && (
          <Button size="sm" className="ms-auto" onClick={() => { setForm({ ...form, employeeId: '', totalAmount: '', installmentsCount: '6', monthlyDeduction: '' }); setOpen(true); }}>
            <Plus className="h-4 w-4" /> سلفة جديدة
          </Button>
        )}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} emptyText="لا توجد سلف/قروض" maxBodyHeight="50vh" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>سلفة / قرض جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="mb-1.5">الموظف</Label><EmpSelect value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} /></div>
            <div><Label className="mb-1.5">الوصف</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1.5">المبلغ (د.ك)</Label><Input type="number" step="any" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} /></div>
              <div><Label className="mb-1.5">عدد الأقساط</Label><Input type="number" value={form.installmentsCount} onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">القسط الشهري (د.ك)</Label>
                <Input type="number" step="any" placeholder="فارغ = المبلغ ÷ الأقساط" value={form.monthlyDeduction} onChange={(e) => setForm({ ...form, monthlyDeduction: e.target.value })} />
              </div>
              <div><Label className="mb-1.5">بداية الخصم</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            </div>
            <div><Label className="mb-1.5">ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create} disabled={!form.employeeId || !form.totalAmount || !form.installmentsCount}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== القسم الرئيسي =====
export function RequestsSection({ canWrite, meId, role, companyName }: { canWrite: boolean; meId: string; role: string; companyName: string }) {
  void companyName;
  const isAdmin = role === 'admin';
  const isHr = role === 'hr';
  return (
    <div className="space-y-4">
      <PageHeader
        title="الطلبات والموافقات"
        subtitle="طلبات الموظفين بسلسلة موافقات حتى 4 مستويات لكل وحدة — والسلف تُخصم تلقائيًا من الرواتب"
      />
      <Tabs defaultValue="requests" dir="rtl">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="requests" className="gap-1.5"><ClipboardList className="h-4 w-4" /> الطلبات</TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5"><Settings2 className="h-4 w-4" /> إعدادات الموافقات</TabsTrigger>
          <TabsTrigger value="loans" className="gap-1.5"><Landmark className="h-4 w-4" /> السلف والقروض</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab canWrite={canWrite} meId={meId} isAdmin={isAdmin} isHr={isHr} />
        </TabsContent>
        <TabsContent value="workflow" className="mt-4">
          <WorkflowTab canWrite={isAdmin || role === 'hr'} />
        </TabsContent>
        <TabsContent value="loans" className="mt-4">
          <LoansTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
