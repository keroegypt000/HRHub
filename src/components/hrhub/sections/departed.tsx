'use client';

// الموظفون المتوفون (رحمهم الله) + المنصرفون من الشركة — تتبع المستحقات المتبقية للسداد
// تسجيل دفعات جزئية، تعديل التسوية، طباعة كشف مستحقات
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate } from '@/lib/client';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Flower2, UserMinus, Printer, HandCoins, Pencil, Plus, Wallet, AlertTriangle } from 'lucide-react';
import { DEPARTURE_REASONS, reasonLabel, calcEos, INDEMNITY_LAW } from '@/lib/indemnity';
import { indemnityDoc, printHtml } from '@/components/hrhub/print-docs';
import { cn } from '@/lib/utils';

interface SettlementRow {
  id: string;
  employee: { id: string; name: string; code: string; department?: { name: string } | null };
  departureDate: string; reason: string;
  hireDate: string | null; lastWage: number; yearsServed: number;
  indemnityFull: number; reasonFactor: number; eosAmount: number;
  leaveAllowance: number; otherDues: number; deductions: number;
  totalDue: number; paidAmount: number; status: string; notes: string | null;
}

interface SettlementsData {
  rows: SettlementRow[];
  summary: { count: number; totalDue: number; paidAmount: number; remaining: number; pending: number; partial: number; paid: number };
}

interface NoSettlementEmp {
  id: string; code: string; name: string; status: string;
  department?: { name: string } | null;
  departureDate?: string | null; departureReason?: string | null; deathDate?: string | null;
}

function Kpi({ title, value, sub, icon: Icon, tone }: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', tone)}>
          <Icon className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-extrabold tabular leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { t: string; c: string }> = {
    pending: { t: 'مطالبة بالتسديد', c: 'bg-red-50 text-red-700 border-red-200' },
    partial: { t: 'مدفوع جزئيًا', c: 'bg-amber-100 text-amber-800 border-amber-200' },
    paid: { t: 'سُدد بالكامل', c: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };
  const m = map[s] || { t: s, c: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <Badge variant="outline" className={m.c}>{m.t}</Badge>;
}

// ===== لوحة إدارة التسوية المشتركة (دفعات + تعديل + طباعة) =====
function SettlementActions({ s, canWrite, companyName, onChanged }: {
  s: SettlementRow; canWrite: boolean; companyName: string; onChanged: () => void;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex gap-1.5 flex-wrap">
      <Button variant="outline" size="sm" className="h-8 text-xs"
        onClick={() => printHtml(indemnityDoc({
          employee: s.employee,
          reasonAr: reasonLabel(s.reason),
          departureDate: fmtDate(s.departureDate),
          hireDate: s.hireDate ? fmtDate(s.hireDate) : '—',
          yearsServed: s.yearsServed, lastWage: s.lastWage,
          indemnityFull: s.indemnityFull, factor: s.reasonFactor,
          eosAmount: s.eosAmount, leaveAllowance: s.leaveAllowance,
          otherDues: s.otherDues, deductions: s.deductions,
          totalDue: s.totalDue, paidAmount: s.paidAmount,
          note: s.notes || undefined, law: INDEMNITY_LAW,
        }, companyName))}>
        <Printer className="h-3.5 w-3.5" /> كشف
      </Button>
      {canWrite && (
        <>
          {s.status !== 'paid' && s.totalDue > 0 && (
            <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => setPayOpen(true)}>
              <HandCoins className="h-3.5 w-3.5" /> دفعة
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> تعديل
          </Button>
        </>
      )}

      {payOpen && (
        <PaymentDialog s={s} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); onChanged(); }} />
      )}
      {editOpen && (
        <EditSettlementDialog s={s} onClose={() => setEditOpen(false)} onDone={() => { setEditOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

function PaymentDialog({ s, onClose, onDone }: { s: SettlementRow; onClose: () => void; onDone: () => void }) {
  const remaining = Math.round((s.totalDue - s.paidAmount) * 1000) / 1000;
  const [amount, setAmount] = useState(String(remaining));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/settlements/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: Number(amount) || 0, notes: notes || undefined }),
      });
      toast.success('تم تسجيل الدفعة');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تسجيل الدفعة');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>تسجيل دفعة — {s.employee.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
            <div><p className="text-xs text-muted-foreground">الإجمالي</p><p className="tabular font-bold">{fmtKWD(s.totalDue)}</p></div>
            <div><p className="text-xs text-muted-foreground">المدفوع</p><p className="tabular font-bold text-emerald-700">{fmtKWD(s.paidAmount)}</p></div>
            <div><p className="text-xs text-muted-foreground">المتبقي</p><p className="tabular font-bold text-red-700">{fmtKWD(remaining)}</p></div>
          </div>
          <div>
            <Label className="mb-1.5 block">مبلغ الدفعة (د.ك) *</Label>
            <Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">ملاحظة الدفعة (طريقة الدفع/الشيك...)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: تحويل بنكي" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'جارٍ الحفظ...' : 'تسجيل الدفعة'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSettlementDialog({ s, onClose, onDone }: { s: SettlementRow; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    departureDate: fmtDate(s.departureDate),
    reason: s.reason,
    lastWage: String(s.lastWage),
    leaveAllowance: String(s.leaveAllowance),
    otherDues: String(s.otherDues),
    deductions: String(s.deductions),
    paidAmount: String(s.paidAmount),
    notes: s.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => calcEos({
    hireDate: s.hireDate, endDate: form.departureDate, reason: form.reason,
    lastWage: Number(form.lastWage) || 0,
    leaveAllowance: Number(form.leaveAllowance) || 0,
    otherDues: Number(form.otherDues) || 0,
    deductions: Number(form.deductions) || 0,
  }), [s.hireDate, form]);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/settlements/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          departureDate: form.departureDate, reason: form.reason,
          lastWage: Number(form.lastWage) || 0,
          leaveAllowance: Number(form.leaveAllowance) || 0,
          otherDues: Number(form.otherDues) || 0,
          deductions: Number(form.deductions) || 0,
          paidAmount: Number(form.paidAmount) || 0,
          notes: form.notes || null,
        }),
      });
      toast.success('تم تعديل التسوية');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التعديل');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>تعديل التسوية — {s.employee.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <Label className="mb-1.5 block">تاريخ نهاية الخدمة</Label>
            <Input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">السبب</Label>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTURE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {([['lastWage', 'آخر أجر شهري (د.ك)'], ['leaveAllowance', 'بدل الإجازات (د.ك)'],
            ['otherDues', 'مستحقات أخرى (د.ك)'], ['deductions', 'استقطاعات (د.ك)'],
            ['paidAmount', 'المدفوع حتى الآن (د.ك)']] as [keyof typeof form, string][]).map(([k, label]) => (
            <div key={k}>
              <Label className="mb-1.5 block">{label}</Label>
              <Input type="number" step="any" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="col-span-2">
            <Label className="mb-1.5 block">ملاحظات</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="rounded-lg border p-3 text-sm flex justify-between items-center bg-muted/30">
          <span className="font-bold">الإجمالي بعد التعديل</span>
          <span className="tabular font-extrabold text-emerald-700">{fmtKWD(preview.totalDue)} د.ك</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التعديل'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSettlementFor({ emp, companyName, onDone }: { emp: NoSettlementEmp; companyName: string; onDone: () => void }) {
  const [form, setForm] = useState({
    departureDate: emp.deathDate ? fmtDate(emp.deathDate)
      : emp.departureDate ? fmtDate(emp.departureDate)
      : new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 10),
    reason: emp.status === 'deceased' || emp.deathDate ? 'deceased' : (emp.departureReason || 'terminated'),
    leaveAllowance: '0', otherDues: '0', deductions: '0', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api('/api/settlements', {
        method: 'POST',
        body: JSON.stringify({ employeeId: emp.id, ...form }),
      });
      toast.success('تم إنشاء التسوية');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>تسوية لموظف سابق — {emp.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">هذا الموظف منصرف/متوفى بالفعل بدون تسوية محسوبة — أنشئ تسوية الآن.</p>
        <div className="grid grid-cols-2 gap-3 py-1">
          <div>
            <Label className="mb-1.5 block">تاريخ نهاية الخدمة *</Label>
            <Input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">السبب *</Label>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTURE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {([['leaveAllowance', 'بدل الإجازات (د.ك)'], ['otherDues', 'مستحقات أخرى (د.ك)'], ['deductions', 'استقطاعات (د.ك)']] as [keyof typeof form, string][]).map(([k, label]) => (
            <div key={k}>
              <Label className="mb-1.5 block">{label}</Label>
              <Input type="number" step="any" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'جارٍ الحفظ...' : 'إنشاء التسوية'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== جدول التسويات المشترك =====
function SettlementsTable({ canWrite, companyName, kind, reloadKey, setReload }: {
  canWrite: boolean; companyName: string; kind: 'deceased' | 'departed'; reloadKey: number; setReload: () => void;
}) {
  const [data, setData] = useState<SettlementsData | null>(null);
  const [without, setWithout] = useState<NoSettlementEmp[]>([]);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [creating, setCreating] = useState<NoSettlementEmp | null>(null);

  const load = useCallback(() => {
    api<SettlementsData>('/api/settlements?limit=1000').then((d) => setData(d)).catch((e) => toast.error(e.message));
    const status = kind === 'deceased' ? 'deceased' : 'terminated';
    api<{ rows: NoSettlementEmp[] }>(`/api/employees?status=${status}&limit=2000`)
      .then((d) => setWithout(d.rows.filter((r) => r.status === 'deceased' || r.departureDate)))
      .catch(() => {});
  }, [kind]);
  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('hrhub:refresh', onRefresh);
    return () => window.removeEventListener('hrhub:refresh', onRefresh);
  }, [load]);

  if (!data) return <Skeleton className="h-72" />;

  const rows = data.rows
    .filter((r) => kind === 'deceased' ? r.reason === 'deceased' : r.reason !== 'deceased')
    .filter((r) => !onlyUnpaid || r.status !== 'paid');

  const withoutIds = new Set(without.map((w) => w.id));
  const withIds = new Set(data.rows.map((r) => r.employee.id));
  const missing = without.filter((w) => !withIds.has(w.id));

  const columns: Column<SettlementRow>[] = [
    { key: 'name', header: kind === 'deceased' ? 'الموظف (رحمه الله)' : 'الموظف',
      render: (r) => (<div><p className="font-medium">{r.employee.name}</p><p className="text-xs text-muted-foreground tabular">{r.employee.code}{r.employee.department ? ` · ${r.employee.department.name}` : ''}</p></div>) },
    { key: 'departure', header: 'التاريخ', render: (r) => <span className="tabular">{fmtDate(r.departureDate)}</span> },
    { key: 'reason', header: 'السبب', render: (r) => <StatusBadge status={r.reason} />, hideOnMobile: true },
    { key: 'years', header: 'سنوات', render: (r) => <span className="tabular">{r.yearsServed?.toFixed?.(2) || r.yearsServed}</span>, hideOnMobile: true },
    { key: 'total', header: 'إجمالي المستحقات', render: (r) => <span className="tabular font-bold">{fmtKWD(r.totalDue)}</span> },
    { key: 'paid', header: 'المدفوع', render: (r) => <span className="tabular text-emerald-700">{fmtKWD(r.paidAmount)}</span> },
    { key: 'remaining', header: 'المتبقي للسداد', render: (r) => (
      <span className={cn('tabular font-extrabold', r.totalDue - r.paidAmount > 0.001 ? 'text-red-700' : 'text-emerald-700')}>
        {fmtKWD(Math.max(0, r.totalDue - r.paidAmount))}
      </span>
    ) },
    { key: 'status', header: 'الحالة', render: (r) => <StatusPill s={r.status} /> },
    { key: 'actions', header: '', render: (r) => <SettlementActions s={r} canWrite={canWrite} companyName={companyName} onChanged={load} /> },
  ];

  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <p className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {missing.length} موظفًا بدون تسوية محسوبة</p>
          <div className="flex flex-wrap gap-2">
            {missing.slice(0, 6).map((m) => (
              <Button key={m.id} variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreating(m)}>
                <Plus className="h-3 w-3" /> {m.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={onlyUnpaid} onCheckedChange={setOnlyUnpaid} />
          <span className="text-muted-foreground">إظهار غير المسدد فقط (مطالبات التسديد)</span>
        </div>
      </div>

      <DataTable<SettlementRow> columns={columns} rows={rows} loading={false} />

      {creating && (
        <CreateSettlementFor emp={creating} companyName={companyName} onDone={() => { setCreating(null); load(); setReload(); }} />
      )}
    </div>
  );
}

// ===== صفحة الموظفين المتوفين =====
export function DeceasedSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [summary, setSummary] = useState<SettlementsData['summary'] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<SettlementsData>('/api/settlements?limit=1000')
      .then((d) => {
        const rows = d.rows.filter((r) => r.reason === 'deceased');
        setSummary({
          count: rows.length,
          totalDue: Math.round(rows.reduce((s, r) => s + r.totalDue, 0) * 1000) / 1000,
          paidAmount: Math.round(rows.reduce((s, r) => s + r.paidAmount, 0) * 1000) / 1000,
          remaining: Math.round(rows.reduce((s, r) => s + r.totalDue - r.paidAmount, 0) * 1000) / 1000,
          pending: rows.filter((r) => r.status === 'pending').length,
          partial: rows.filter((r) => r.status === 'partial').length,
          paid: rows.filter((r) => r.status === 'paid').length,
        });
      })
      .catch(() => {});
  }, [reloadKey]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="الموظفون المتوفون"
        subtitle="سجل الموظفين المتوفين أثناء الخدمة أو بعدها — مستحقاتهم تُصرف للمستحقين (الورثة) كاملة حسب المادة 53 — رحمهم الله"
        actions={<Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300"><Flower2 className="h-3.5 w-3.5 ml-1" /> سجل الوفيات</Badge>}
      />
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi title="عدد المتوفين" value={summary.count} icon={Flower2} tone="bg-slate-200 text-slate-700" />
          <Kpi title="إجمالي المستحقات" value={`${fmtKWD(summary.totalDue)} د.ك`} icon={Wallet} tone="bg-emerald-100 text-emerald-700" />
          <Kpi title="ما صُرف للورثة" value={`${fmtKWD(summary.paidAmount)} د.ك`} icon={HandCoins} tone="bg-emerald-100 text-emerald-700" />
          <Kpi title="متبقٍ للتسديد" value={`${fmtKWD(summary.remaining)} د.ك`} sub="مطالبة مستحقة" icon={AlertTriangle} tone={summary.remaining > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'} />
        </div>
      )}
      <SettlementsTable canWrite={canWrite} companyName={companyName} kind="deceased" reloadKey={reloadKey} setReload={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

// ===== صفحة المنصرفين والمستحقات المتبقية =====
export function DepartedSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [summary, setSummary] = useState<SettlementsData['summary'] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<SettlementsData>('/api/settlements?limit=1000')
      .then((d) => {
        const rows = d.rows.filter((r) => r.reason !== 'deceased');
        setSummary({
          count: rows.length,
          totalDue: Math.round(rows.reduce((s, r) => s + r.totalDue, 0) * 1000) / 1000,
          paidAmount: Math.round(rows.reduce((s, r) => s + r.paidAmount, 0) * 1000) / 1000,
          remaining: Math.round(rows.reduce((s, r) => s + r.totalDue - r.paidAmount, 0) * 1000) / 1000,
          pending: rows.filter((r) => r.status === 'pending').length,
          partial: rows.filter((r) => r.status === 'partial').length,
          paid: rows.filter((r) => r.status === 'paid').length,
        });
      })
      .catch(() => {});
  }, [reloadKey]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="المنصرفون والمستحقات"
        subtitle="الموظفون الذين تركوا الشركة — تتبع المستحقات المتبقية مطالبةً للتسديد وتسجيل الدفعات"
        actions={<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><UserMinus className="h-3.5 w-3.5 ml-1" /> مطالبات التسديد</Badge>}
      />
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi title="عدد المنصرفين" value={summary.count} icon={UserMinus} tone="bg-amber-100 text-amber-700" />
          <Kpi title="إجمالي المستحقات" value={`${fmtKWD(summary.totalDue)} د.ك`} icon={Wallet} tone="bg-emerald-100 text-emerald-700" />
          <Kpi title="ما صُرف" value={`${fmtKWD(summary.paidAmount)} د.ك`} icon={HandCoins} tone="bg-emerald-100 text-emerald-700" />
          <Kpi title="متبقٍ للتسديد" value={`${fmtKWD(summary.remaining)} د.ك`} sub={`بانتظار: ${summary.pending} · جزئي: ${summary.partial}`} icon={AlertTriangle} tone={summary.remaining > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'} />
        </div>
      )}
      <SettlementsTable canWrite={canWrite} companyName={companyName} kind="departed" reloadKey={reloadKey} setReload={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
