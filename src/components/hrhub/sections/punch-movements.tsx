'use client';

// حركات البصمة بالصور: كل حركة بوقتها ونوعها وصورتها والجهاز، ومجموع الساعات اليومي (أول بصمة ← آخر بصمة)
// بدون الاعتماد على الورديات — للمراجعة السريعة والطباعة
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { optionLoaders } from '@/components/hrhub/crud-panel';
import { PageHeader } from '@/components/hrhub/common';
import { ServerFilterBar } from '@/components/hrhub/table-filters';
import { openStoredFile } from '@/components/hrhub/file-field';
import { getBranding, brandCss, letterhead, docTitle, brandFooter } from '@/lib/branding';
import { printHtml } from '@/components/hrhub/print-docs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Printer, Download, RefreshCcw, Search, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Row {
  id: string; employeeId: string | null; code: string; name: string; department: string; company: string;
  date: string; day: string; time: string; kind: string; minutes: number | null; photoId: string | null; device: string; ip: string;
}
interface Data { rows: Row[]; employees: { code: string; name: string; days: number; minutes: number; punches: number; photos: number }[]; totals: { punches: number; employees: number; photos: number; minutes: number; days: number }; truncated: boolean }

const kw = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const monthStart = () => `${kw().slice(0, 7)}-01`;
export const fmtHM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const FIRST_LAST = new Set(['دخول', 'خروج', 'دخول (بدون خروج)']);
const KIND_TONE: Record<string, string> = { 'دخول': 'text-emerald-700', 'خروج': 'text-sky-700', 'تكرار': 'text-muted-foreground' };

export function PunchMovementsSection({ companyName = '' }: { companyName?: string }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(kw());
  const [companyId, setCompanyId] = useState('all');
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [departmentId, setDepartmentId] = useState('all');
  const [employeeId, setEmployeeId] = useState('all');
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [firstLast, setFirstLast] = useState(true); // أول وآخر بصمة فقط
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { optionLoaders.companies().then((o) => setCompanies(o.companyId || [])).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to });
      if (companyId !== 'all') p.set('companyId', companyId);
      if (departmentId !== 'all') p.set('departmentId', departmentId);
      if (employeeId !== 'all') p.set('employeeId', employeeId);
      setData(await api<Data>(`/api/reports/movements?${p}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذّر التحميل'); }
    finally { setLoading(false); }
  }, [from, to, companyId, departmentId, employeeId]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter((r) => (!firstLast || FIRST_LAST.has(r.kind)) && (!onlyPhotos || r.photoId) && (!q || [r.code, r.name, r.date, r.kind, r.device].some((v) => v.toLowerCase().includes(q))));
  }, [data, search, onlyPhotos, firstLast]);

  // تجميع حسب الموظف مع سطر الإجمالي
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = r.employeeId || r.code; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.values()].map((g) => ({ code: g[0].code, name: g[0].name, rows: g, minutes: g.reduce((s, r) => s + (r.minutes || 0), 0), days: g.filter((r) => r.minutes !== null).length }));
  }, [rows]);
  const totalMinutes = groups.reduce((s, g) => s + g.minutes, 0);
  const companyLabel = companyId === 'all' ? 'كل الشركات' : companyId === 'none' ? 'بدون شركة' : companies.find((c) => c.value === companyId)?.label || '';

  const exportCsv = () => {
    const head = ['رقم الموظف', 'الاسم', 'التاريخ', 'اليوم', 'وقت الحركة', 'نوع العملية', 'مجموع الساعات', 'الصورة', 'وصف الجهاز', 'عنوان الشبكة'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: unknown[][] = [[`حركات البصمة ${from} → ${to} — ${companyLabel}`], head];
    for (const g of groups) {
      for (const r of g.rows) lines.push([r.code, r.name, r.date, r.day, r.time, r.kind, r.minutes !== null ? fmtHM(r.minutes) : '', r.photoId ? 'نعم' : '', r.device, r.ip]);
      lines.push(['', `إجمالي ${g.name}`, `${g.days} يوم`, '', '', '', fmtHM(g.minutes)]);
    }
    lines.push(['', 'الإجمالي', '', '', '', '', fmtHM(totalMinutes)]);
    const blob = new Blob(['﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `punch-movements-${from}-${to}.csv`; a.click();
  };

  const print = () => {
    const b0 = getBranding();
    const b = companyName && (!b0.companyName || b0.companyName === 'الشركة') ? { ...b0, companyName } : b0;
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
    const img = (id: string | null) => (id ? `<img src="${location.origin}/api/files/${id}" style="width:54px;height:54px;object-fit:cover;border-radius:4px">` : '—');
    const sections = groups.map((g) => `<section>${letterhead(b)}${docTitle('حركات البصمة بالصور', `${from} → ${to}`)}
      <table class="emp"><tr><th>رقم الموظف</th><td>${esc(g.code)}</td><th>الاسم</th><td>${esc(g.name)}</td><th>أيام الحضور</th><td>${g.days}</td><th>مجموع الساعات</th><td>${fmtHM(g.minutes)}</td></tr></table>
      <table><thead><tr><th>التاريخ</th><th>اليوم</th><th>وقت الحركة</th><th>نوع العملية</th><th>مجموع الساعات</th><th>الصورة</th><th>وصف الجهاز</th><th>عنوان الشبكة</th></tr></thead>
      <tbody>${g.rows.map((r) => `<tr><td>${r.date}</td><td>${r.day}</td><td>${r.time}</td><td>${esc(r.kind)}</td><td><b>${r.minutes !== null ? fmtHM(r.minutes) : ''}</b></td><td>${img(r.photoId)}</td><td>${esc(r.device)}</td><td>${esc(r.ip)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="4">الإجمالي</th><th>${fmtHM(g.minutes)}</th><th colspan="3"></th></tr></tfoot></table>${brandFooter(b)}</section>`).join('');
    printHtml(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>حركات البصمة بالصور</title><style>${brandCss(b)}
      body{margin:12px;color:#111}table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px}th,td{border:1px solid #c8c8c8;padding:4px 6px;text-align:center;vertical-align:middle}
      .emp th{width:11%}.emp td{font-weight:700}section{page-break-after:always}section:last-child{page-break-after:auto}tr{page-break-inside:avoid}</style></head>
      <body>${sections || `${letterhead(b)}<p>لا توجد حركات في الفترة</p>`}</body></html>`);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="حركات البصمة بالصور"
        subtitle="كل حركة بوقتها وصورتها، ومجموع الساعات اليومي من أول بصمة إلى آخر بصمة"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> تصدير Excel</Button>
            <Button variant="outline" size="sm" onClick={print} disabled={!rows.length}><Printer className="h-4 w-4" /> طباعة</Button>
            <Button size="sm" onClick={load}><RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} /> تحديث</Button>
          </>
        }
      />

      <ServerFilterBar from={from} to={to} setFrom={setFrom} setTo={setTo}
        departmentId={departmentId} setDepartmentId={setDepartmentId} employeeId={employeeId} setEmployeeId={setEmployeeId}
        onReset={() => { setFrom(monthStart()); setTo(kw()); setCompanyId('all'); setDepartmentId('all'); setEmployeeId('all'); setSearch(''); setOnlyPhotos(false); setFirstLast(true); }}>
        <div>
          <p className="mb-0.5 text-[11px] text-muted-foreground">الشركة</p>
          <Select value={companyId} onValueChange={setCompanyId} dir="rtl">
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشركات</SelectItem>
              {companies.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              <SelectItem value="none">بدون شركة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40 flex-1">
          <p className="mb-0.5 text-[11px] text-muted-foreground">بحث</p>
          <div className="relative"><Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم، اسم، تاريخ، جهاز..." className="h-8 pr-8" /></div>
        </div>
        <div className="flex h-8 overflow-hidden rounded-md border text-sm">
          <button type="button" onClick={() => setFirstLast(true)} className={cn('px-3', firstLast ? 'bg-emerald-600 text-white' : 'hover:bg-muted')}>أول وآخر بصمة</button>
          <button type="button" onClick={() => setFirstLast(false)} className={cn('border-r px-3', !firstLast ? 'bg-emerald-600 text-white' : 'hover:bg-muted')}>كل الحركات</button>
        </div>
        <Button variant={onlyPhotos ? 'default' : 'outline'} size="sm" className="h-8" onClick={() => setOnlyPhotos(!onlyPhotos)}><Camera className="h-4 w-4" /> بالصور فقط</Button>
      </ServerFilterBar>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['الحركات', rows.length], ['الموظفون', groups.length], ['حركات بالصور', rows.filter((r) => r.photoId).length], ['مجموع الساعات', fmtHM(totalMinutes)]].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"><p className="text-xs opacity-80">{k}</p><p className="text-xl font-extrabold tabular">{v}</p></div>
        ))}
      </div>
      {data?.truncated && <p className="text-xs text-amber-700">النتيجة كبيرة — تم عرض أول 20,000 حركة. ضيّق الفترة أو اختر شركة أو موظفًا.</p>}

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-right">{['رقم الموظف', 'الاسم', 'التاريخ', 'اليوم', 'وقت الحركة', 'نوع العملية', 'مجموع الساعات', 'الصورة', 'وصف الجهاز', 'عنوان الشبكة'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">جارٍ التحميل...</td></tr>}
                {!loading && !rows.length && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">لا توجد حركات بهذه الفلاتر</td></tr>}
                {!loading && groups.map((g) => [
                  ...g.rows.map((r) => (
                    <tr key={r.id} className="whitespace-nowrap border-t hover:bg-muted/30">
                      <td className="px-3 py-1.5 tabular">{r.code}</td>
                      <td className="px-3 py-1.5 font-medium">{r.name}</td>
                      <td className="px-3 py-1.5 tabular">{r.date}</td>
                      <td className="px-3 py-1.5">{r.day}</td>
                      <td className="px-3 py-1.5 tabular">{r.time}</td>
                      <td className={cn('px-3 py-1.5 font-medium', KIND_TONE[r.kind] || 'text-amber-700')}>{r.kind}</td>
                      <td className="px-3 py-1.5 font-bold tabular">{r.minutes !== null ? fmtHM(r.minutes) : ''}</td>
                      <td className="px-3 py-1">{r.photoId
                        ? <button type="button" onClick={() => openStoredFile(r.photoId!)} title="عرض الصورة"><img src={`/api/files/${r.photoId}`} alt="" className="h-11 w-11 rounded object-cover" /></button>
                        : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-1.5 text-xs">{r.device}</td>
                      <td className="px-3 py-1.5 text-xs tabular" dir="ltr">{r.ip}</td>
                    </tr>
                  )),
                  <tr key={`sum-${g.code}`} className="border-t bg-emerald-50/70 font-semibold text-emerald-900">
                    <td className="px-3 py-1.5" colSpan={2}>إجمالي {g.name}</td>
                    <td className="px-3 py-1.5" colSpan={4}>{g.days} يوم · {g.rows.length} حركة</td>
                    <td className="px-3 py-1.5 tabular">{fmtHM(g.minutes)}</td>
                    <td colSpan={3} />
                  </tr>,
                ])}
              </tbody>
              {!loading && groups.length > 1 && (
                <tfoot className="sticky bottom-0 bg-emerald-100 font-bold text-emerald-900">
                  <tr><td className="px-3 py-2" colSpan={6}>الإجمالي ({groups.length} موظف)</td><td className="px-3 py-2 tabular">{fmtHM(totalMinutes)}</td><td colSpan={3} /></tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
