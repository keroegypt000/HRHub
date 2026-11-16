'use client';

// التقارير: 8 تقارير بفلاتر كاملة (فترة سريعة/مخصصة، قسم، موظف بالبحث، حالة، بحث داخل التقرير)
// + بطاقات ملخص أعلى التقرير + إجمالي لكل موظف + صف الإجمالي العام — والطباعة/التصدير بنفس ما يظهر على الشاشة
import { useCallback, useEffect, useMemo, useState } from 'react';
import { reportTotals } from '@/lib/report-totals';
import { reportKpis, groupByEmployee, employeeColumn, type Cell } from '@/lib/report-summary';
import { api } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Download, Printer, RefreshCcw, Search, RotateCcw, Filter } from 'lucide-react';
import { optionLoaders } from '@/components/hrhub/crud-panel';
import { EmployeePicker, type PickerEmployee } from '@/components/hrhub/employee-picker';

const REPORTS = [
  { key: 'daily', label: 'الحضور اليومي', desc: 'كل يوم لكل موظف بحالته وسجلاته' },
  { key: 'monthly', label: 'الملخص الشهري', desc: 'إجماليات لكل موظف في الفترة' },
  { key: 'late', label: 'التأخير والخروج المبكر', desc: 'كل حالات التأخير والمبكر بالدقائق' },
  { key: 'overtime', label: 'العمل الإضافي', desc: 'ساعات الإضافي وقيمتها المقترحة ×1.25' },
  { key: 'absence', label: 'الغياب', desc: 'أيام الغياب والبصمة الناقصة' },
  { key: 'leaves', label: 'رصيد الإجازات', desc: 'الأرصدة المستهلكة لكل نوع' },
  { key: 'time-card', label: 'كشف الوقت الشهري', desc: 'يوم-باليوم لموظف مع الإحصائيات (Total Time Card)' },
  { key: 'punches', label: 'حركات البصمة بالصور', desc: 'كل دخول/خروج بوقته وصورته والجهاز وعنوانه' },
] as const;
type ReportKey = (typeof REPORTS)[number]['key'];

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  daily: [
    { value: 'present', label: 'حاضر' }, { value: 'late', label: 'متأخر' }, { value: 'half_day', label: 'نص يوم' },
    { value: 'absent', label: 'غائب' }, { value: 'missed_punch', label: 'بصمة ناقصة' }, { value: 'leave', label: 'في إجازة' },
    { value: 'holiday', label: 'عطلة رسمية' }, { value: 'weekend', label: 'راحة أسبوعية' },
    { value: 'present,late,half_day', label: 'كل الحاضرين' }, { value: 'absent,missed_punch', label: 'غياب + بصمة ناقصة' },
  ],
  absence: [{ value: 'absent', label: 'غائب' }, { value: 'missed_punch', label: 'بصمة ناقصة' }],
};
const GROUPABLE: ReportKey[] = ['daily', 'late', 'overtime', 'absence', 'punches'];

// الفترات السريعة (بتوقيت الكويت)
const kw = () => new Date(Date.now() + 3 * 3600_000);
const key = (d: Date) => d.toISOString().slice(0, 10);
function preset(p: string): [string, string] {
  const t = kw();
  const y = t.getUTCFullYear(); const m = t.getUTCMonth();
  if (p === 'today') return [key(t), key(t)];
  if (p === 'yesterday') { const d = new Date(t.getTime() - 86400_000); return [key(d), key(d)]; }
  if (p === 'week') { const d = new Date(t.getTime() - t.getUTCDay() * 86400_000); return [key(d), key(t)]; }
  if (p === 'last-month') return [key(new Date(Date.UTC(y, m - 1, 1))), key(new Date(Date.UTC(y, m, 0)))];
  if (p === 'year') return [key(new Date(Date.UTC(y, 0, 1))), key(t)];
  return [key(new Date(Date.UTC(y, m, 1))), key(t)]; // هذا الشهر
}
const PRESETS = [['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['last-month', 'الشهر الماضي'], ['year', 'هذه السنة']] as const;

const TONES: Record<string, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800', blue: 'border-sky-200 bg-sky-50 text-sky-800',
  teal: 'border-teal-200 bg-teal-50 text-teal-800', slate: 'border-slate-200 bg-slate-50 text-slate-800',
};

export function ReportsSection({ companyName = '' }: { companyName?: string }) {
  const [type, setType] = useState<ReportKey>('daily');
  const [range, setRange] = useState<[string, string]>(() => preset('month'));
  const [from, to] = range;
  const setFrom = (v: string) => setRange([v, to]);
  const setTo = (v: string) => setRange([from, v]);
  const [departmentId, setDepartmentId] = useState('all');
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [employeeId, setEmployeeId] = useState('all');
  const [allEmployees, setAllEmployees] = useState<PickerEmployee[]>([]);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [statistics, setStatistics] = useState<Record<string, string | number> | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [meta, setMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { optionLoaders.departments().then((o) => setDepartments(o.departmentId || [])); }, []);
  useEffect(() => {
    api<{ rows: { id: string; name: string; code: string; status: string; department?: { id: string } | null }[] }>('/api/employees?limit=2000')
      .then((d) => setAllEmployees(d.rows.filter((e) => e.status !== 'terminated' && e.status !== 'deceased').map((e) => ({ id: e.id, name: e.name, code: e.code, departmentId: e.department?.id || null }))))
      .catch(() => {});
  }, []);
  // قائمة الموظفين حسب القسم المختار
  const employees = useMemo(() => allEmployees.filter((e) => departmentId === 'all' || e.departmentId === departmentId), [allEmployees, departmentId]);

  const needsEmployee = type === 'time-card';
  const load = useCallback(async () => {
    if (needsEmployee && employeeId === 'all') { setHeaders([]); setRows([]); setStatistics(null); setMeta(null); return; }
    setLoading(true);
    setStatistics(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (departmentId !== 'all') params.set('departmentId', departmentId);
      if (employeeId !== 'all') params.set('employeeId', employeeId);
      if (status !== 'all' && STATUS_OPTIONS[type]) params.set('status', status);
      const data = await api<{ columns: string[]; rows: Cell[][]; period?: string; statistics?: Record<string, string | number> }>(`/api/reports/${type}?${params}`);
      setHeaders(data.columns);
      setRows(data.rows);
      setMeta(data.period || null);
      setStatistics(data.statistics || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التقرير');
    } finally {
      setLoading(false);
    }
  }, [type, from, to, departmentId, employeeId, status, needsEmployee]);
  useEffect(() => { load(); }, [load]);

  // تغيير القسم يلغي اختيار موظف من قسم آخر — وتغيير التقرير يلغي فلتر حالة غير متاح له
  const changeDepartment = (v: string) => {
    setDepartmentId(v);
    if (employeeId !== 'all' && v !== 'all' && allEmployees.find((e) => e.id === employeeId)?.departmentId !== v) setEmployeeId('all');
  };
  const changeType = (k: ReportKey) => { setType(k); if (!STATUS_OPTIONS[k]?.some((o) => o.value === status)) setStatus('all'); };
  const resetFilters = () => { setRange(preset('month')); setDepartmentId('all'); setEmployeeId('all'); setStatus('all'); setSearch(''); setGrouped(false); };

  // البحث داخل التقرير (أي عمود)
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const canGroup = GROUPABLE.includes(type) && !!employeeColumn(headers);
  const display = useMemo(() => (grouped && canGroup ? groupByEmployee(headers, visibleRows) : visibleRows.map((row) => ({ row, subtotal: false }))), [grouped, canGroup, headers, visibleRows]);
  const totals = useMemo(() => reportTotals(headers, visibleRows), [headers, visibleRows]);
  const kpis = useMemo(() => reportKpis(type, headers, visibleRows), [type, headers, visibleRows]);

  const reportLabel = REPORTS.find((r) => r.key === type)?.label || '';
  const deptLabel = departmentId === 'all' ? 'كل الأقسام' : departments.find((d) => d.value === departmentId)?.label || '';
  const empLabel = employeeId === 'all' ? 'كل الموظفين' : (() => { const e = allEmployees.find((x) => x.id === employeeId); return e ? `${e.name} (${e.code})` : ''; })();
  const statusLabel = status === 'all' ? '' : STATUS_OPTIONS[type]?.find((o) => o.value === status)?.label || '';
  const filtersText = [`الفترة: ${from} → ${to}`, `القسم: ${deptLabel}`, `الموظف: ${empLabel}`, statusLabel && `الحالة: ${statusLabel}`, search && `بحث: ${search}`].filter(Boolean).join(' · ');

  // أعمدة الجدول — صفوف «إجمالي الموظف» و«الإجمالي» بخط عريض وخلفية مميزة
  const tableRows = [...display, ...(totals ? [{ row: totals, subtotal: false, total: true }] : [])].map((d, idx) => {
    const obj: Record<string, unknown> = { id: (d as { total?: boolean }).total ? '__total' : d.subtotal ? `__sub${idx}` : String(idx) };
    d.row.forEach((cell, i) => { obj[String(i)] = cell; });
    return obj as { id: string } & Record<string, unknown>;
  });
  const tableColumns: Column<{ id: string } & Record<string, unknown>>[] = headers.map((h, i) => ({
    key: String(i),
    header: h,
    hideOnMobile: i > 3 && h !== 'الصورة',
    className: i > 0 ? 'tabular' : '',
    render: (r) => {
      const v = String(r[String(i)] ?? '—');
      if (r.id === '__total') return <span className="font-bold text-emerald-800">{v}</span>;
      if (r.id.startsWith('__sub')) return <span className="font-semibold text-slate-700">{v}</span>;
      if (!v.startsWith('photo:')) return v;
      const src = `/api/files/${v.slice(6)}`;
      return (
        <a href={src} target="_blank" rel="noreferrer" title="تكبير الصورة">
          <img src={src} alt="صورة البصمة" loading="lazy" className="h-12 w-12 rounded-md object-cover border" />
        </a>
      );
    },
  }));

  /** خلية للطباعة: الصورة كـ img بعنوان كامل */
  const printCell = (cell: Cell) => {
    const v = String(cell);
    return v.startsWith('photo:') ? `<img src="${location.origin}/api/files/${v.slice(6)}" style="width:56px;height:56px;object-fit:cover;border-radius:4px">` : v;
  };
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));

  const exportReport = () => {
    const lines: Cell[][] = [[reportLabel], [filtersText], [], headers, ...display.map((d) => d.row), ...(totals ? [totals] : [])];
    if (kpis.length) lines.push([], ['الملخص'], ...kpis.map((k) => [k.label, k.value]));
    const csv = lines.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hrhub-${type}-${from}-${to}.csv`;
    a.click();
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('اسمح بالنوافذ المنبثقة للطباعة'); return; }
    if (type === 'punches') { printPunches(w); return; }
    if (type === 'time-card') { w.close(); printTimeCards(false); return; }
    const kpiHtml = kpis.length ? `<table class="kpi"><tr>${kpis.map((k) => `<td><span>${esc(k.label)}</span><b>${esc(k.value)}</b></td>`).join('')}</tr></table>` : '';
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(reportLabel)}</title>
      <style>@page{size:A4 ${headers.length > 8 ? 'landscape' : 'portrait'};margin:10mm}body{font-family:Tahoma,system-ui,sans-serif;margin:0;color:#111}
      .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1F8A70;padding-bottom:6px;margin-bottom:6px}
      .top b{font-size:15px}.top span{color:#1F8A70;font-weight:bold;font-size:14px}.meta{font-size:11px;color:#444;margin:4px 0 8px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 5px;text-align:center;font-size:11px}
      thead th{background:#eef7f4}.sub td{background:#f4f4f4;font-weight:bold}tfoot th{background:#e2f1ec;font-size:11.5px}tr{page-break-inside:avoid}
      .kpi{margin-bottom:8px}.kpi td{border:1px solid #cde3dc;background:#f6fbf9}.kpi span{display:block;font-size:10px;color:#555}.kpi b{font-size:13px}
      .foot{font-size:10px;color:#666;margin-top:8px}</style></head>
      <body><div class="top"><div><b>${esc(companyName || 'HRHub')}</b><br><span>${esc(reportLabel)}</span></div><div class="meta">تاريخ الطباعة: ${new Date().toISOString().slice(0, 10)}</div></div>
      <p class="meta">${esc(filtersText)}${meta ? ` · ${esc(meta)}` : ''}</p>${kpiHtml}
      <table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${display.map((d) => `<tr${d.subtotal ? ' class="sub"' : ''}>${d.row.map((cell) => `<td>${printCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${totals ? `<tfoot><tr>${totals.map((cell) => `<th>${esc(cell)}</th>`).join('')}</tr></tfoot>` : ''}</table>
      <p class="foot">عدد الصفوف: ${visibleRows.length}</p></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  /**
   * كارت دوام الموظف المطبوع: بيانات الموظف، جدول الأيام، الإجمالي، الإحصائيات، وأماكن التوقيع
   * all=true: كارت لكل موظف (في القسم المختار) — صفحة لكل موظف
   */
  const printTimeCards = async (all: boolean) => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('اسمح بالنوافذ المنبثقة للطباعة'); return; }
    w.document.write('<p style="font-family:system-ui;padding:20px">جارٍ تجهيز كروت الدوام...</p>');
    try {
      let ids: string[];
      if (!all && employeeId !== 'all') ids = [employeeId];
      else {
        const list = await api<{ rows: { id: string; status: string; department?: { id: string } | null }[] }>('/api/employees?limit=2000');
        ids = list.rows.filter((e) => e.status === 'active' && (departmentId === 'all' || e.department?.id === departmentId)).map((e) => e.id);
      }
      if (!ids.length) { w.close(); toast.error('اختر الموظف أولًا'); return; }
      const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
      const sections: string[] = [];
      for (const id of ids) {
        const d = await api<{ employee: { code: string; name: string; department: string; position: string }; period: string; columns: string[]; rows: (string | number)[][]; statistics: Record<string, string | number> }>(
          `/api/reports/time-card?from=${from}&to=${to}&employeeId=${id}`);
        const tot = reportTotals(d.columns, d.rows);
        const st = d.statistics || {};
        sections.push(`<section>
          <div class="top"><div><b>${esc(companyName || 'HRHub')}</b><br><span>كارت دوام الموظف</span></div><div class="per">الفترة: ${esc(d.period)}</div></div>
          <table class="emp"><tr><th>الرقم الوظيفي</th><td>${esc(d.employee.code)}</td><th>الاسم</th><td>${esc(d.employee.name)}</td></tr>
          <tr><th>القسم</th><td>${esc(d.employee.department)}</td><th>المسمى</th><td>${esc(d.employee.position)}</td></tr></table>
          <table class="grid"><thead><tr>${d.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          ${tot ? `<tfoot><tr>${tot.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></tfoot>` : ''}</table>
          <table class="stats"><tr>
            <th>أيام حضور</th><td>${esc(st.presentDays)}</td><th>ساعات العمل</th><td>${esc(st.workedHours)}</td>
            <th>تأخير (دقيقة)</th><td>${esc(st.lateMinutes)}</td><th>خروج مبكر (دقيقة)</th><td>${esc(st.earlyMinutes)}</td>
            <th>غياب (ساعة)</th><td>${esc(st.absenceHours)}</td><th>إجمالي الإضافي</th><td>${esc(st.otTotal)}</td></tr></table>
          <div class="sign"><div>توقيع الموظف<span></span></div><div>مسؤول القسم<span></span></div><div>الموارد البشرية<span></span></div></div>
          <p class="foot">أقر بصحة بيانات الحضور الموضحة أعلاه · تاريخ الطباعة: ${new Date().toISOString().slice(0, 10)}</p>
        </section>`);
      }
      w.document.open();
      w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كروت الدوام</title>
        <style>@page{size:A4 landscape;margin:10mm}body{font-family:Tahoma,system-ui,sans-serif;margin:0;color:#111}
        section{page-break-after:always}section:last-child{page-break-after:auto}
        .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1F8A70;padding-bottom:6px;margin-bottom:8px}
        .top b{font-size:15px}.top span{color:#1F8A70;font-weight:bold}.per{font-size:12px}
        table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #bbb;padding:3px 4px;text-align:center}
        .emp th{background:#e8f3ef;width:12%;font-size:11px}.emp td{font-weight:bold;font-size:12px}
        .grid{font-size:9.5px}.grid th{background:#eee}.grid tfoot th{background:#e8f3ef}tr{page-break-inside:avoid}
        .stats{font-size:10.5px}.stats th{background:#f5f5f5}
        .sign{display:flex;gap:24px;margin-top:18px}.sign div{flex:1;text-align:center;font-size:12px;font-weight:bold}
        .sign span{display:block;border-bottom:1px solid #333;height:38px;margin-top:4px}
        .foot{font-size:10px;color:#555;margin-top:10px}</style></head><body>${sections.join('')}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 500);
    } catch (e) {
      w.close();
      toast.error(e instanceof Error ? e.message : 'فشل تجهيز الكروت');
    }
  };

  /** طباعة «حركات البصمة بالصور» بنفس شكل نموذج العميل: صفحة لكل موظف برقمه واسمه ثم جدول الحركات */
  const printPunches = (w: Window) => {
    const groups = new Map<string, { name: string; rows: (string | number)[][] }>();
    for (const r of rows) {
      const code = String(r[1]);
      if (!groups.has(code)) groups.set(code, { name: String(r[2]), rows: [] });
      groups.get(code)!.rows.push(r);
    }
    const head = ['م', 'التاريخ', 'اليوم', 'وقت الحركة', 'نوع العملية', 'الصورة', 'وصف الجهاز', 'عنوان الشبكة'];
    const pick = (r: (string | number)[]) => [r[0], r[3], r[4], r[5], r[6], r[7], r[8], r[9]];
    const sections = [...groups.entries()].map(([code, g]) => `
      <section>
        <table class="emp"><tr><th>رقم الموظف</th><td>${code}</td><th>الاسم</th><td>${g.name}</td><th>الفترة</th><td>${from} → ${to}</td></tr></table>
        <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${g.rows.map((r) => `<tr>${pick(r).map((c) => `<td>${printCell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </section>`).join('');
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>حركات البصمة بالصور</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px}h1{color:#1F8A70;font-size:17px;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}th,td{border:1px solid #cfcfcf;padding:4px 6px;text-align:center;vertical-align:middle}
      th{background:#eee}.emp th{background:#e8f3ef;width:12%}.emp td{font-weight:bold}
      section{page-break-after:always}section:last-child{page-break-after:auto}tr{page-break-inside:avoid}</style></head>
      <body><h1>حركات البصمة بالصور</h1>${sections || '<p>لا توجد حركات في الفترة</p>'}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 1200);
  };

  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="اختر التقرير، حدد الفلاتر، وراجع الملخص والإجماليات قبل الطباعة أو التصدير"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportReport} disabled={!rows.length}><Download className="h-4 w-4" /> تصدير Excel (CSV)</Button>
            {type === 'time-card' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => printTimeCards(false)} disabled={employeeId === 'all'}><Printer className="h-4 w-4" /> طباعة كارت الموظف</Button>
                <Button variant="outline" size="sm" onClick={() => printTimeCards(true)}><Printer className="h-4 w-4" /> طباعة كروت {departmentId === 'all' ? 'كل الموظفين' : 'القسم'}</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={printReport} disabled={!rows.length}><Printer className="h-4 w-4" /> طباعة</Button>
            )}
            <Button size="sm" onClick={load}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث</Button>
          </>
        }
      />

      {/* اختيار التقرير */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => changeType(r.key)}
            className={`rounded-lg border p-2.5 text-right transition-colors ${type === r.key ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
            <p className={`text-sm font-bold ${type === r.key ? 'text-emerald-800' : ''}`}>{r.label}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* الفلاتر */}
      <Card className="mb-3">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {PRESETS.map(([k, label]) => {
              const [a, b] = preset(k);
              const on = a === from && b === to;
              return (
                <button key={k} type="button" onClick={() => setRange([a, b])}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'hover:border-emerald-400'}`}>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><p className="mb-1 text-[11px] text-muted-foreground">من</p><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" dir="ltr" /></div>
            <div><p className="mb-1 text-[11px] text-muted-foreground">إلى</p><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" dir="ltr" /></div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">القسم</p>
              <Select value={departmentId} onValueChange={changeDepartment} dir="rtl">
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">الموظف{needsEmployee ? ' *' : ''}</p>
              <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId}
                allowAll={!needsEmployee} allLabel={needsEmployee ? 'اختر الموظف' : 'كل الموظفين'} />
            </div>
            {STATUS_OPTIONS[type] && (
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">الحالة</p>
                <Select value={status} onValueChange={setStatus} dir="rtl">
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    {STATUS_OPTIONS[type].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="min-w-48 flex-1">
              <p className="mb-1 text-[11px] text-muted-foreground">بحث داخل التقرير</p>
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم، رقم، تاريخ، حالة..." className="h-9 pr-8" />
              </div>
            </div>
            {canGroup && (
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
                <Switch checked={grouped} onCheckedChange={setGrouped} /> إجمالي لكل موظف
              </label>
            )}
            <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> مسح الفلاتر</Button>
          </div>
        </CardContent>
      </Card>

      {needsEmployee && employeeId === 'all' && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          اختر الموظف لعرض كشف الوقت التفصيلي — أو اضغط «طباعة كروت كل الموظفين» لطباعة كارت لكل موظف.
        </div>
      )}

      {/* بطاقات الملخص */}
      {!loading && kpis.length > 0 && rows.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-lg border p-3 ${TONES[k.tone || 'slate']}`}>
              <p className="text-xs opacity-80">{k.label}</p>
              <p className="text-xl font-extrabold tabular">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {type === 'time-card' && statistics && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {([['أيام حضور', statistics.presentDays, 'green'], ['ساعات الوردية', statistics.dutyHours, 'slate'], ['ساعات العمل', statistics.workedHours, 'teal'],
            ['تأخير (دقيقة)', statistics.lateMinutes, 'amber'], ['خروج مبكر (دقيقة)', statistics.earlyMinutes, 'amber'], ['غياب (ساعة)', statistics.absenceHours, 'red'],
            ['إجمالي الإضافي', statistics.otTotal, 'teal'], ['إضافي عادي', statistics.otNormal, 'teal'], ['إضافي راحة (س)', statistics.otWeekend, 'teal'],
            ['إضافي عطلة (س)', statistics.otHoliday, 'teal'], ['إجازة (ساعة)', statistics.leaveHours, 'blue'], ['عادي Regular (س)', statistics.regularHours, 'slate']] as [string, string | number, string][]).map(([k, v, tone]) => (
            <div key={k} className={`rounded-lg border p-3 ${TONES[tone]}`}>
              <p className="text-xs opacity-80">{k}</p>
              <p className="text-lg font-extrabold tabular">{v}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{reportLabel} · {visibleRows.length} صف{search ? ` (من ${rows.length})` : ''}</span>
            <span>{filtersText}{meta ? ` · ${meta}` : ''}</span>
          </div>
          <DataTable columns={tableColumns} rows={tableRows} loading={loading} emptyText="لا توجد بيانات بهذه الفلاتر" maxBodyHeight="60vh" details={false} />
          {totals && !loading && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <b>الإجمالي:</b>
              {totals.map((v, i) => (i > 0 && v !== '' ? <span key={i}>{headers[i]}: <b className="tabular">{v}</b></span> : null))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
