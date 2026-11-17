'use client';

// أرصدة الإجازات: صفحة مستقلة بإجمالي رصيد كل الموظفين وقيمته (نفس حساب كارت الموظف ونهاية الخدمة)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate } from '@/lib/client';
import { PageHeader } from '@/components/hrhub/common';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { useTableFilters } from '@/components/hrhub/table-filters';
import { printHtml } from '@/components/hrhub/print-docs';
import { getBranding, brandCss, letterhead, docTitle, brandFooter } from '@/lib/branding';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CalendarDays, Users, Wallet, TrendingDown, Printer, Download, RefreshCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  employee: { id: string; name: string; code: string; department: { id: string; name: string } | null };
  hireDate: string | null;
  opening: { balance: number; date: string } | null;
  accrued: number; used: number; balance: number;
  monthly: number; dayRate: number; value: number;
  leavesTaken: Record<string, number>;
  noHireDate: boolean;
}
interface Data { asOf: string; quota: number; perMonth: number; rows: Row[] }

const todayKey = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const d1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function Kpi({ title, value, sub, icon: Icon, tone }: { title: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-extrabold leading-tight tabular">{value}</p>
          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function LeaveBalancesSection({ companyName }: { companyName: string }) {
  const [asOf, setAsOf] = useState(todayKey());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<Data>(`/api/leave-balances?asOf=${asOf}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'فشل التحميل'); }
    finally { setLoading(false); }
  }, [asOf]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const tf = useTableFilters(rows, { date: false });
  const shown = tf.filtered;
  const t = useMemo(() => ({
    count: shown.length,
    accrued: r3(shown.reduce((s, r) => s + r.accrued, 0)),
    used: r3(shown.reduce((s, r) => s + r.used, 0)),
    balance: r3(shown.reduce((s, r) => s + r.balance, 0)),
    value: r3(shown.reduce((s, r) => s + r.value, 0)),
    negative: shown.filter((r) => r.balance < 0).length,
    noHire: shown.filter((r) => r.noHireDate).length,
  }), [shown]);

  const columns: Column<Row>[] = [
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee.name}</p><p className="text-xs text-muted-foreground">{r.employee.code}{r.employee.department ? ` · ${r.employee.department.name}` : ''}</p></div> },
    { key: 'hire', header: 'تاريخ التعيين', render: (r) => (r.hireDate ? <span className="tabular">{fmtDate(r.hireDate)}</span> : <span className="text-xs text-red-600">غير مسجل</span>) },
    { key: 'opening', header: 'رصيد افتتاحي', render: (r) => (r.opening ? <span className="tabular" title={`بتاريخ ${fmtDate(r.opening.date)}`}>{d1(r.opening.balance)}</span> : '—'), hideOnMobile: true },
    { key: 'accrued', header: 'المستحق (يوم)', render: (r) => <span className="tabular">{d1(r.accrued)}</span> },
    { key: 'used', header: 'المستخدم (يوم)', render: (r) => <span className="tabular">{d1(r.used)}</span> },
    { key: 'balance', header: 'الرصيد (يوم)', render: (r) => <span className={cn('font-bold tabular', r.balance < 0 ? 'text-red-600' : 'text-emerald-700')}>{d1(r.balance)}</span> },
    { key: 'dayRate', header: 'أجر اليوم', render: (r) => <span className="tabular">{fmtKWD(r.dayRate)}</span>, hideOnMobile: true },
    { key: 'value', header: 'قيمة الرصيد', render: (r) => <span className="font-semibold tabular">{fmtKWD(r.value)}</span> },
    { key: 'other', header: 'إجازات مأخوذة', render: (r) => <span className="block max-w-56 whitespace-normal text-xs text-muted-foreground">{Object.entries(r.leavesTaken).map(([k, v]) => `${k}: ${d1(v)}`).join(' · ') || '—'}</span>, hideOnMobile: true },
  ];

  const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const exportCsv = () => {
    const head = ['الرقم', 'الموظف', 'القسم', 'تاريخ التعيين', 'رصيد افتتاحي', 'المستحق (يوم)', 'المستخدم (يوم)', 'الرصيد (يوم)', 'أجر اليوم', 'قيمة الرصيد'];
    const lines = [
      [`أرصدة الإجازات حتى ${asOf}`], head,
      ...shown.map((r) => [r.employee.code, r.employee.name, r.employee.department?.name || '', r.hireDate ? fmtDate(r.hireDate) : '', r.opening?.balance ?? '', r.accrued, r.used, r.balance, r.dayRate, r.value]),
      ['', 'الإجمالي', '', '', '', t.accrued, t.used, t.balance, '', t.value],
    ];
    const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `leave-balances-${asOf}.csv`; a.click();
  };

  const print = () => {
    const tr = shown.map((r, i) => `<tr><td>${i + 1}</td><td>${r.employee.code}</td><td>${r.employee.name}</td><td>${r.employee.department?.name || ''}</td><td>${r.hireDate ? fmtDate(r.hireDate) : '—'}</td><td>${d1(r.accrued)}</td><td>${d1(r.used)}</td><td><b>${d1(r.balance)}</b></td><td>${fmtKWD(r.dayRate)}</td><td>${fmtKWD(r.value)}</td></tr>`).join('');
    printHtml(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>أرصدة الإجازات</title><style>
      ${brandCss()}body{margin:16px;color:#111}h2{font-size:12px;color:#555;margin:0 0 10px;font-weight:400}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:4px 6px;text-align:right}th{background:#e8f5ee}
      tfoot td{font-weight:bold;background:#f3f3f3}.k{display:flex;gap:16px;font-size:12px;margin-bottom:10px}@page{size:A4 landscape;margin:12mm}</style></head><body>
      ${letterhead(getBranding().companyName === 'الشركة' && companyName ? { ...getBranding(), companyName } : getBranding())}${docTitle('أرصدة الإجازات السنوية')}
      <h2>حتى تاريخ ${asOf} · الحصة السنوية ${data?.quota ?? 30} يوم · أجر اليوم = الراتب الشهري ÷ ${data?.perMonth ?? 26}</h2>
      <div class="k"><span>الموظفون: <b>${t.count}</b></span><span>المستحق: <b>${d1(t.accrued)}</b> يوم</span><span>المستخدم: <b>${d1(t.used)}</b> يوم</span><span>الرصيد: <b>${d1(t.balance)}</b> يوم</span><span>القيمة: <b>${fmtKWD(t.value)}</b></span></div>
      <table><thead><tr><th>م</th><th>الرقم</th><th>الموظف</th><th>القسم</th><th>تاريخ التعيين</th><th>المستحق</th><th>المستخدم</th><th>الرصيد</th><th>أجر اليوم</th><th>القيمة</th></tr></thead>
      <tbody>${tr}</tbody><tfoot><tr><td colspan="5">الإجمالي</td><td>${d1(t.accrued)}</td><td>${d1(t.used)}</td><td>${d1(t.balance)}</td><td></td><td>${fmtKWD(t.value)}</td></tr></tfoot></table>
      ${brandFooter()}</body></html>`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="أرصدة الإجازات"
        subtitle={`رصيد الإجازة السنوية لكل الموظفين وقيمته — نفس حساب كارت الموظف ونهاية الخدمة (${data?.quota ?? 30} يوم في السنة)`}
        actions={
          <>
            <div className="flex items-center gap-1.5 text-sm"><span className="text-muted-foreground">حتى تاريخ</span>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-40" dir="ltr" /></div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!shown.length}><Download className="h-4 w-4" /> تصدير Excel</Button>
            <Button variant="outline" size="sm" onClick={print} disabled={!shown.length}><Printer className="h-4 w-4" /> طباعة</Button>
            <Button size="sm" onClick={load}><RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} /> تحديث</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi title="الموظفون" value={t.count} icon={Users} tone="bg-slate-100 text-slate-700" />
        <Kpi title="إجمالي المستحق" value={`${d1(t.accrued)} يوم`} icon={CalendarDays} tone="bg-blue-100 text-blue-700" />
        <Kpi title="إجمالي المستخدم" value={`${d1(t.used)} يوم`} icon={TrendingDown} tone="bg-amber-100 text-amber-700" />
        <Kpi title="إجمالي الرصيد" value={`${d1(t.balance)} يوم`} icon={CalendarDays} tone="bg-emerald-100 text-emerald-700" />
        <Kpi title="قيمة الأرصدة" value={fmtKWD(t.value)} sub="الرصيد × أجر اليوم" icon={Wallet} tone="bg-teal-100 text-teal-700" />
      </div>

      {(t.negative > 0 || t.noHire > 0) && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          {t.negative > 0 && <span>{t.negative} موظف برصيد سالب (إجازات تتجاوز المستحق).</span>}
          {t.noHire > 0 && <span>{t.noHire} موظف بدون تاريخ تعيين أو رصيد افتتاحي — يظهر رصيدهم صفرًا حتى تسجيل تاريخ التعيين.</span>}
        </div>
      )}

      <Card>
        <CardContent className="p-3">
          {tf.bar}
          <DataTable columns={columns} rows={shown} loading={loading} filters={false} emptyText="لا يوجد موظفون" maxBodyHeight="60vh" />
          {!loading && shown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <b>الإجمالي ({t.count} موظف):</b>
              <span>المستحق: <b className="tabular">{d1(t.accrued)}</b> يوم</span>
              <span>المستخدم: <b className="tabular">{d1(t.used)}</b> يوم</span>
              <span>الرصيد: <b className="tabular">{d1(t.balance)}</b> يوم</span>
              <span>القيمة: <b className="tabular">{fmtKWD(t.value)}</b></span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
