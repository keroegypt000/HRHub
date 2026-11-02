'use client';

// الرواتب: فترات بمسار كامل — إنشاء ← حساب ← مراجعة قسائم ← اعتماد ← صرف ← تصدير بنك
import { useCallback, useEffect, useState } from 'react';
import { api, fmtKWD, fmtDate, fmtDateTime } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Plus, Calculator, CheckCheck, Banknote, LockOpen, Printer, Download, FileText, Eye,
} from 'lucide-react';
import { downloadFile, fmtDate as fd } from '@/lib/client';
import { payslipDoc, monthlyStatementDoc, salaryCertificateDoc, printHtml } from '@/components/hrhub/print-docs';

interface PeriodRow extends Record<string, unknown> {
  id: string; name: string; startDate: string; endDate: string; status: string;
  computedAt?: string | null; approvedAt?: string | null; paidAt?: string | null;
  notes?: string | null; _count?: { payslips: number };
  totalNet: number; totalEarnings: number; totalDeductions: number;
}

interface SlipRow extends Record<string, unknown> {
  id: string; employeeId: string; basicSalary: number; totalEarnings: number;
  totalDeductions: number; netPay: number; workedDays: number; absenceDays: number;
  otHours: number; lateMinutes: number; notes?: string | null; status: string;
  employee?: { id: string; name: string; code: string; department?: { name: string } | null; bankAccount?: string | null };
  items: { id: string; name: string; type: string; amount: number; note?: string | null }[];
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
        compute: `حُسبت ${res.employees} قسيمة — الصافي ${fmtKWD(res.totalNet || 0)} د.ك — راجعها ثم اعتمد`,
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
    const first = slips[0];
    if (!first) return;
    // طباعة دفعة كاملة: نفتح أول قسيمة — المتصفح يطبع الصفحة الحالية فقط،
    // لذا نولّد كشفاً شهرياً ملخصاً بكل الموظفين
    printHtml(monthlyStatementDoc(
      selected?.name || '',
      slips.map((s) => ({ name: s.employee?.name || '', code: s.employee?.code || '', basicSalary: s.basicSalary, netPay: s.netPay, workedDays: s.workedDays, absenceDays: s.absenceDays })),
      companyName
    ));
    void first;
  };

  const periodColumns: Column<PeriodRow>[] = [
    { key: 'name', header: 'الفترة', render: (r) => <span className="font-bold tabular text-base">{r.name}</span> },
    { key: 'range', header: 'النطاق', render: (r) => <span className="tabular">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span>, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'count', header: 'القسائم', render: (r) => <span className="tabular">{r._count?.payslips ?? 0}</span> },
    { key: 'net', header: 'الصافي (د.ك)', render: (r) => <span className="tabular font-bold text-emerald-700">{fmtKWD(r.totalNet)}</span> },
    { key: 'paidAt', header: 'تاريخ الصرف', render: (r) => r.paidAt ? fmtDateTime(r.paidAt).slice(0, 10) : '—', hideOnMobile: true },
    {
      key: 'actions', header: 'إجراءات', render: (r) => (
        <div className="flex flex-wrap gap-1">
          {canWrite && r.status === 'draft' && (
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
          {role === 'admin' && ['approved', 'paid'].includes(r.status) && (
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
        subtitle="المسار: إنشاء ← حساب ← مراجعة ← اعتماد (قفل نهائي) ← صرف — معادلات معلنة بالدينار الكويتي ثلاث خانات"
        actions={
          canWrite && (
            <Button size="sm" onClick={() => { setNewName(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`); setOpen(true); }}>
              <Plus className="h-4 w-4" /> فترة جديدة
            </Button>
          )
        }
      />

      <DataTable columns={periodColumns} rows={periods} loading={loading} emptyText="لا توجد فترات رواتب — أنشئ فترة الشهر مثل 2026-01" maxBodyHeight="45vh" />

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
            <DataTable columns={slipColumns} rows={slips} emptyText="لا قسائم — احسب الفترة أولًا" maxBodyHeight="50vh" />
          </CardContent>
        </Card>
      )}

      {/* تفصيل قسيمة */}
      <Dialog open={!!viewSlip} onOpenChange={(o) => !o && setViewSlip(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>قسيمة {viewSlip?.employee?.name} — فترة {selected?.name}</DialogTitle>
          </DialogHeader>
          {viewSlip && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الأساسي</p><p className="tabular font-bold">{fmtKWD(viewSlip.basicSalary)} د.ك</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">المكملات</p><p className="tabular font-bold text-emerald-700">{fmtKWD(viewSlip.totalEarnings)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الاستقطاعات</p><p className="tabular font-bold text-red-700">{fmtKWD(viewSlip.totalDeductions)}</p></div>
              </div>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead><tr className="bg-muted/60 text-right"><th className="p-2">البند</th><th>النوع</th><th>المبلغ (د.ك)</th><th>المصدر / المعادلة</th></tr></thead>
                <tbody>
                  {(viewSlip.items || []).map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2 font-medium">{it.name}</td>
                      <td><StatusBadge status={it.type} /></td>
                      <td className="tabular">{fmtKWD(it.amount)}</td>
                      <td className="text-xs text-muted-foreground">{it.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-600 text-white font-extrabold">
                    <td className="p-2.5" colSpan={2}>صافي الراتب</td>
                    <td className="tabular p-2.5">{fmtKWD(viewSlip.netPay)} د.ك</td>
                    <td className="text-xs p-2.5">تُطبع بالتفقيط العربي</td>
                  </tr>
                </tfoot>
              </table>
              {viewSlip.notes && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠️ {viewSlip.notes}</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => printOne(viewSlip)}><Printer className="h-4 w-4" /> طباعة القسيمة</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* إنشاء فترة */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>فترة رواتب جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1.5">اسم الفترة (YYYY-MM)</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="2026-01" />
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
