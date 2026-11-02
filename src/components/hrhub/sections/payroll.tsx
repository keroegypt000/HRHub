'use client';

// الرواتب: فترات بمسار كامل — إنشاء ← حساب ← مراجعة قسائم بمفرداتها ← تعديل يدوي ← اعتماد ← صرف
// كشف مفردات القسيمة: بنود مرتبة + ملخص أيام + سجل يومي ملون + بنود يدوية بصلاحية (محاسب/مدير)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate, fmtDateTime, LEDGER_AR, LEDGER_COLORS } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Calculator, CheckCheck, Banknote, LockOpen, Printer, Download, FileText, Eye,
  Pencil, Trash2, CalendarDays,
} from 'lucide-react';
import { downloadFile } from '@/lib/client';
import { payslipDoc, monthlyStatementDoc, printHtml } from '@/components/hrhub/print-docs';
import { cn } from '@/lib/utils';

interface PeriodRow extends Record<string, unknown> {
  id: string; name: string; startDate: string; endDate: string; status: string;
  computedAt?: string | null; approvedAt?: string | null; paidAt?: string | null;
  notes?: string | null; _count?: { payslips: number };
  totalNet: number; totalEarnings: number; totalDeductions: number;
  activeEmployees?: number;
}

interface SlipItem {
  id: string; name: string; type: string; amount: number; note?: string | null;
  source?: string; editedBy?: string | null; editedAt?: string | null;
}

interface SlipRow extends Record<string, unknown> {
  id: string; employeeId: string; basicSalary: number; totalEarnings: number;
  totalDeductions: number; netPay: number; workedDays: number; absenceDays: number;
  paidLeaveDays: number; unpaidLeaveDays: number; holidayDays: number; weekOffDays: number;
  dayLedger?: string | null;
  otHours: number; lateMinutes: number; notes?: string | null; status: string;
  employee?: { id: string; name: string; code: string; department?: { name: string } | null; bankAccount?: string | null };
  items: SlipItem[];
}

interface ItemForm { id?: string; name: string; type: string; amount: string; note: string; }

/** شريط سجل الأيام الملون — خانة لكل يوم من أيام الفترة */
function DayLedger({ ledgerJson }: { ledgerJson?: string | null }) {
  const ledger = useMemo<{ d: string; s: string }[]>(() => {
    if (!ledgerJson) return [];
    try { return JSON.parse(ledgerJson); } catch { return []; }
  }, [ledgerJson]);
  if (!ledger.length) return null;

  const codes = [...new Set(ledger.map((l) => l.s))];
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-xs font-bold flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> سجل أيام الفترة</p>
      <div className="flex flex-wrap gap-1" dir="ltr">
        {ledger.map((l, i) => (
          <span
            key={i}
            title={`يوم ${l.d} — ${LEDGER_AR[l.s] || l.s}`}
            className={cn('h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-white cursor-default', LEDGER_COLORS[l.s] || 'bg-gray-400')}
          >
            {parseInt(l.d, 10)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {codes.map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm inline-block', LEDGER_COLORS[c] || 'bg-gray-400')} />
            {LEDGER_AR[c] || c}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayChip({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className={cn('rounded-lg border p-2 text-center', tone)}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular font-bold text-sm">{value}</p>
    </div>
  );
}

export function PayrollSection({ canWrite, role, companyName }: { canWrite: boolean; role: string; companyName: string }) {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<PeriodRow | null>(null);
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewSlip, setViewSlip] = useState<SlipRow | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [deleteItem, setDeleteItem] = useState<SlipItem | null>(null);

  // تعديل البنود متاح قبل اعتماد الفترة — بصلاحية كتابة رواتب (محاسب/مدير)
  const canEditSlip = canWrite && !!selected && ['draft', 'computed'].includes(selected.status);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ rows: PeriodRow[] }>('/api/payroll-periods');
      setPeriods(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await api('/api/payroll-periods', { method: 'POST', body: JSON.stringify({ name: newName, notes }) });
      toast.success(`أُنشئت فترة ${newName} — احسبها الآن`);
      setOpen(false);
      setNewName('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإنشاء');
    }
  };

  const act = async (p: PeriodRow, action: 'compute' | 'approve' | 'pay' | 'reopen') => {
    setBusy(true);
    try {
      const res = await api<{ employees?: number; totalNet?: number; total?: number }>(`/api/payroll-periods/${p.id}/${action}`, { method: 'POST' });
      const msgs = {
        compute: `حُسبت ${res.employees} قسيمة — الصافي ${fmtKWD(res.totalNet || 0)} د.ك — راجع المفردات ثم اعتمد`,
        approve: 'اعتُمدت الفترة — قُفلت نهائيًا ولا يتأثر بأي تعديل لاحق على الحضور',
        pay: `سُجل الصرف — جاهزة لتصدير ملف البنك`,
        reopen: 'أُعيدت الفترة إلى مسودة (مدير) — مسجل في التدقيق',
      };
      toast.success(msgs[action]);
      load();
      if (selected?.id === p.id) openPeriod({ ...p, status: action === 'compute' ? 'computed' : action === 'approve' ? 'approved' : action === 'pay' ? 'paid' : 'draft' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإجراء');
    } finally {
      setBusy(false);
    }
  };

  const openPeriod = async (p: PeriodRow) => {
    setSelected(p);
    try {
      const data = await api<{ payslips: SlipRow[] }>(`/api/payroll-periods/${p.id}`);
      setSlips(data.payslips);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تحميل القسائم');
    }
  };

  const refreshViewSlip = async (slipId: string) => {
    if (!selected) return;
    try {
      const data = await api<{ payslips: SlipRow[] }>(`/api/payroll-periods/${selected.id}`);
      setSlips(data.payslips);
      const fresh = data.payslips.find((s) => s.id === slipId);
      if (fresh) setViewSlip(fresh);
    } catch { /* تجاهل */ }
  };

  // ===== البنود اليدوية =====
  const openAddItem = () => setItemForm({ name: '', type: 'earning', amount: '', note: '' });
  const openEditItem = (it: SlipItem) => setItemForm({ id: it.id, name: it.name, type: it.type, amount: String(it.amount), note: it.note || '' });

  const saveItem = async () => {
    if (!viewSlip || !itemForm) return;
    if (!itemForm.name.trim()) { toast.error('اسم البند مطلوب'); return; }
    const amount = parseFloat(itemForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('أدخل مبلغًا أكبر من صفر'); return; }
    setSavingItem(true);
    try {
      const body = JSON.stringify({ name: itemForm.name, type: itemForm.type, amount, note: itemForm.note || undefined });
      if (itemForm.id) {
        await api(`/api/payslips/${viewSlip.id}/items/${itemForm.id}`, { method: 'PATCH', body });
        toast.success('عُدّل البند — صار بندًا يدويًا محفوظًا بعد إعادة الحساب');
      } else {
        await api(`/api/payslips/${viewSlip.id}/items`, { method: 'POST', body });
        toast.success('أُضيف البند وأعيد حساب الإجماليات');
      }
      setItemForm(null);
      await refreshViewSlip(viewSlip.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل حفظ البند');
    } finally {
      setSavingItem(false);
    }
  };

  const removeItem = async () => {
    if (!viewSlip || !deleteItem) return;
    try {
      await api(`/api/payslips/${viewSlip.id}/items/${deleteItem.id}`, { method: 'DELETE' });
      toast.success(`حُذف بند «${deleteItem.name}» وأعيد حساب الإجماليات`);
      setDeleteItem(null);
      await refreshViewSlip(viewSlip.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل حذف البند');
    }
  };

  const printOne = (slip: SlipRow) => {
    printHtml(payslipDoc({
      employee: slip.employee || { name: '', code: '', department: null, position: null },
      period: { name: selected?.name || '', startDate: selected?.startDate || '', endDate: selected?.endDate || '' },
      basicSalary: slip.basicSalary,
      items: (slip.items || []) as { name: string; type: string; amount: number; note?: string | null }[],
      totalEarnings: slip.totalEarnings,
      totalDeductions: slip.totalDeductions,
      netPay: slip.netPay,
      workedDays: slip.workedDays,
      absenceDays: slip.absenceDays,
    }, companyName));
  };

  const printAll = () => {
    if (!slips.length) return;
    printHtml(monthlyStatementDoc(
      selected?.name || '',
      slips.map((s) => ({ name: s.employee?.name || '', code: s.employee?.code || '', basicSalary: s.basicSalary, netPay: s.netPay, workedDays: s.workedDays, absenceDays: s.absenceDays })),
      companyName
    ));
  };

  const periodColumns: Column<PeriodRow>[] = [
    { key: 'name', header: 'الفترة', render: (r) => <span className="font-bold tabular text-base">{r.name}</span> },
    { key: 'range', header: 'النطاق', render: (r) => <span className="tabular">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span>, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'count', header: 'القسائم', render: (r) => (
      <span className="tabular">
        {r._count?.payslips ?? 0}
        {r.status !== 'draft' && typeof r.activeEmployees === 'number' && (r._count?.payslips ?? 0) < r.activeEmployees && (
          <span className="text-amber-700 text-xs" title="عدد القسائم أقل من الموظفين النشطين — أعد فتح الفترة ثم أعد الحساب"> ⚠️ ناقص</span>
        )}
      </span>
    ) },
    { key: 'net', header: 'الصافي (د.ك)', render: (r) => <span className="tabular font-bold text-emerald-700">{fmtKWD(r.totalNet)}</span> },
    { key: 'paidAt', header: 'تاريخ الصرف', render: (r) => r.paidAt ? fmtDateTime(r.paidAt).slice(0, 10) : '—', hideOnMobile: true },
    {
      key: 'actions', header: 'إجراءات', render: (r) => (
        <div className="flex flex-wrap gap-1">
          {canWrite && ['draft', 'computed'].includes(r.status) && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act(r, 'compute')}>
              <Calculator className="h-3 w-3" /> {r._count?.payslips ? 'إعادة حساب' : 'حساب'}
            </Button>
          )}
          {canWrite && r.status === 'computed' && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700" disabled={busy} onClick={() => act(r, 'approve')}>
              <CheckCheck className="h-3 w-3" /> اعتماد
            </Button>
          )}
          {canWrite && r.status === 'approved' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act(r, 'pay')}>
              <Banknote className="h-3 w-3" /> صرف
            </Button>
          )}
          {role === 'admin' && ['computed', 'approved', 'paid'].includes(r.status) && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700" disabled={busy} onClick={() => act(r, 'reopen')}>
              <LockOpen className="h-3 w-3" /> إعادة فتح
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openPeriod(r)}>
            <Eye className="h-3 w-3" /> القسائم
          </Button>
          {r.status !== 'draft' && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadFile(`/api/export?entity=bank&periodId=${r.id}`, `hrhub-bank-${r.name}.csv`)}>
              <Download className="h-3 w-3" /> بنك
            </Button>
          )}
        </div>
      ),
    },
  ];

  const slipColumns: Column<SlipRow>[] = [
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-muted-foreground tabular">{r.employee?.code} · {r.employee?.department?.name}</p></div> },
    { key: 'basic', header: 'الأساسي', render: (r) => <span className="tabular">{fmtKWD(r.basicSalary)}</span>, hideOnMobile: true },
    { key: 'earn', header: 'مكملات', render: (r) => <span className="tabular text-emerald-700">{fmtKWD(r.totalEarnings)}</span> },
    { key: 'ded', header: 'استقطاعات', render: (r) => <span className="tabular text-red-700">{fmtKWD(r.totalDeductions)}</span>, hideOnMobile: true },
    { key: 'net', header: 'الصافي (د.ك)', render: (r) => <span className="tabular font-extrabold text-emerald-700">{fmtKWD(r.netPay)}</span> },
    { key: 'days', header: 'عمل/غياب', render: (r) => <span className="tabular">{r.workedDays} / {r.absenceDays}</span>, hideOnMobile: true },
    { key: 'late', header: 'تأخير', render: (r) => r.lateMinutes ? <span className="tabular text-amber-700">{r.lateMinutes}د</span> : '—', hideOnMobile: true },
    { key: 'ot', header: 'إضافي', render: (r) => <span className="tabular">{r.otHours ? `${r.otHours}س` : '—'}</span>, hideOnMobile: true },
    { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—', hideOnMobile: true },
    {
      key: 'print', header: '',
      render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewSlip(r)}>
            <FileText className="h-3 w-3" /> تفصيل
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => printOne(r)}>
            <Printer className="h-3 w-3" /> طباعة
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الرواتب"
        subtitle="المسار: إنشاء ← حساب ← مراجعة المفردات وتعديلها ← اعتماد (قفل نهائي) ← صرف — الغياب والإجازات والعطلات تُحسم يومًا بيوم"
        actions={
          canWrite && (
            <Button size="sm" onClick={() => { setNewName(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`); setOpen(true); }}>
              <Plus className="h-4 w-4" /> فترة جديدة
            </Button>
          )
        }
      />

      <DataTable columns={periodColumns} rows={periods} loading={loading} emptyText="لا توجد فترات رواتب — أنشئ فترة الشهر مثل 2026-11" maxBodyHeight="45vh" />

      {/* قسائم الفترة المحددة */}
      {selected && (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">قسائم فترة {selected.name} <StatusBadge status={selected.status} className="mr-2" /></CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={printAll}><Printer className="h-4 w-4" /> كشف شهري ملخص</Button>
                <Button size="sm" variant="outline" onClick={() => downloadFile(`/api/export?entity=payroll&periodId=${selected.id}`, `hrhub-payroll-${selected.name}.xlsx`)}>
                  <Download className="h-4 w-4" /> تصدير Excel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>إغلاق</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {['approved', 'paid'].includes(selected.status) && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">🔒 الفترة مقفولة نهائيًا — لتعديل الكشوفات: «إعادة فتح» (مدير فقط) ثم «إعادة حساب».</p>
            )}
            <DataTable columns={slipColumns} rows={slips} emptyText="لا قسائم — احسب الفترة أولًا" maxBodyHeight="50vh" />
          </CardContent>
        </Card>
      )}

      {/* تفصيل قسيمة — كشف المفردات */}
      <Dialog open={!!viewSlip} onOpenChange={(o) => !o && setViewSlip(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>قسيمة {viewSlip?.employee?.name} — فترة {selected?.name}</DialogTitle>
          </DialogHeader>
          {viewSlip && (
            <div className="space-y-4">
              {/* ملخص أيام الشهر */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <DayChip label="حضور" value={viewSlip.workedDays} tone="bg-emerald-50 border-emerald-200" />
                <DayChip label="غياب" value={viewSlip.absenceDays} tone="bg-red-50 border-red-200" />
                <DayChip label="إجازة مدفوعة" value={viewSlip.paidLeaveDays ?? 0} tone="bg-sky-50 border-sky-200" />
                <DayChip label="إجازة بدون راتب" value={viewSlip.unpaidLeaveDays ?? 0} tone="bg-sky-50 border-sky-200" />
                <DayChip label="عطلة رسمية" value={viewSlip.holidayDays ?? 0} tone="bg-teal-50 border-teal-200" />
                <DayChip label="راحة أسبوعية" value={viewSlip.weekOffDays ?? 0} tone="bg-slate-50 border-slate-200" />
              </div>

              <DayLedger ledgerJson={viewSlip.dayLedger} />

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الأساسي</p><p className="tabular font-bold">{fmtKWD(viewSlip.basicSalary)} د.ك</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">المكملات</p><p className="tabular font-bold text-emerald-700">{fmtKWD(viewSlip.totalEarnings)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الاستقطاعات</p><p className="tabular font-bold text-red-700">{fmtKWD(viewSlip.totalDeductions)}</p></div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">كشف المفردات ({viewSlip.items?.length || 0} بند)</p>
                {canEditSlip && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openAddItem}>
                    <Plus className="h-3 w-3" /> إضافة بند يدوي
                  </Button>
                )}
              </div>

              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead><tr className="bg-muted/60 text-right"><th className="p-2">البند</th><th>النوع</th><th>المبلغ (د.ك)</th><th>المصدر / المعادلة</th>{canEditSlip && <th className="w-16"></th>}</tr></thead>
                <tbody>
                  {(viewSlip.items || []).map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2 font-medium">
                        {it.name}
                        {it.source === 'manual' && (
                          <Badge variant="outline" className="ms-1.5 bg-amber-50 text-amber-700 border-amber-200 text-[10px] py-0" title={it.editedBy ? `بواسطة ${it.editedBy}` : ''}>يدوي</Badge>
                        )}
                      </td>
                      <td><StatusBadge status={it.type} /></td>
                      <td className="tabular">{fmtKWD(it.amount)}</td>
                      <td className="text-xs text-muted-foreground">{it.note || '—'}</td>
                      {canEditSlip && (
                        <td className="p-1">
                          <div className="flex gap-0.5">
                            <Button size="icon" variant="ghost" className="h-6 w-6" title="تعديل البند" onClick={() => openEditItem(it)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" title="حذف البند" onClick={() => setDeleteItem(it)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-600 text-white font-extrabold">
                    <td className="p-2.5" colSpan={2}>صافي الراتب</td>
                    <td className="tabular p-2.5">{fmtKWD(viewSlip.netPay)} د.ك</td>
                    <td className="text-xs p-2.5" colSpan={canEditSlip ? 2 : 1}>تُطبع بالتفقيط العربي</td>
                  </tr>
                </tfoot>
              </table>

              {!canEditSlip && canWrite && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  🔒 تعديل البنود متاح قبل اعتماد الفترة فقط — أعد فتح الفترة (مدير) للتعديل على فترة معتمدة.
                </p>
              )}

              {viewSlip.notes && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠️ {viewSlip.notes}</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => printOne(viewSlip)}><Printer className="h-4 w-4" /> طباعة القسيمة</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* إضافة/تعديل بند يدوي */}
      <Dialog open={!!itemForm} onOpenChange={(o) => !o && setItemForm(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{itemForm?.id ? 'تعديل بند' : 'إضافة بند يدوي'}</DialogTitle>
          </DialogHeader>
          {itemForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label className="mb-1.5">اسم البند *</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="مثال: بونص أداء / سلفة / خصم خاص" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">النوع *</Label>
                  <Select value={itemForm.type} onValueChange={(v) => setItemForm({ ...itemForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earning">مكمل (يُضاف)</SelectItem>
                      <SelectItem value="deduction">استقطاع (يُخصم)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5">المبلغ (د.ك) *</Label>
                  <Input type="number" step="0.001" min="0" value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1.5">ملاحظة / السبب</Label>
                <Textarea value={itemForm.note} onChange={(e) => setItemForm({ ...itemForm, note: e.target.value })} rows={2} placeholder="مثال: تصحيح يوم محسوب غلط — موافقة المدير" />
              </div>
              <p className="text-xs text-muted-foreground">البند اليدوي محفوظ باسمك في سجل التدقيق ويبقى مكانه حتى بعد إعادة حساب الفترة.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemForm(null)}>إلغاء</Button>
            <Button onClick={saveItem} disabled={savingItem}>{savingItem ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف بند */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>حذف البند؟</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيُحذف بند «{deleteItem?.name}» بقيمة {deleteItem ? fmtKWD(deleteItem.amount) : ''} د.ك ويعاد حساب الصافي. العملية مسجلة في سجل التدقيق.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={removeItem}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إنشاء فترة */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>فترة رواتب جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1.5">اسم الفترة (YYYY-MM)</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="2026-11" />
            </div>
            <div>
              <Label className="mb-1.5">ملاحظات (اختياري)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create} disabled={!/^\d{4}-\d{2}$/.test(newName)}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
