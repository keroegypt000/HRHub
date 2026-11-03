'use client';

// التقارير السبعة: حضور يومي، ملخص شهري، تأخير/مبكر، إضافي، غياب، رصيد إجازات، كشف الوقت الشهري
import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download, Printer, BarChart3 } from 'lucide-react';
import { optionLoaders } from '@/components/hrhub/crud-panel';

const REPORTS = [
  { key: 'daily', label: 'الحضور اليومي', desc: 'كل يوم لكل موظف بحالته وسجلاته' },
  { key: 'monthly', label: 'الملخص الشهري', desc: 'إجماليات لكل موظف في الفترة' },
  { key: 'late', label: 'التأخير والخروج المبكر', desc: 'كل حالات التأخير والمبكر بالدقائق' },
  { key: 'overtime', label: 'العمل الإضافي', desc: 'ساعات الإضافي وقيمتها المقترحة ×1.25' },
  { key: 'absence', label: 'الغياب', desc: 'أيام الغياب والبصمة الناقصة' },
  { key: 'leaves', label: 'رصيد الإجازات', desc: 'الأرصدة المستهلكة لكل نوع' },
  { key: 'time-card', label: 'كشف الوقت الشهري', desc: 'يوم-باليوم لموظف مع الإحصائيات (Total Time Card)' },
] as const;

type ReportKey = (typeof REPORTS)[number]['key'];

export function ReportsSection() {
  const [type, setType] = useState<ReportKey>('daily');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState('all');
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [employeeId, setEmployeeId] = useState('all');
  const [employees, setEmployees] = useState<{ value: string; label: string }[]>([]);
  const [statistics, setStatistics] = useState<Record<string, string | number> | null>(null);
  const [columns, setColumns] = useState<{ key: string; header: string }[]>([]);
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [meta, setMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { optionLoaders.departments().then((o) => setDepartments(o.departmentId || [])); }, []);
  useEffect(() => { optionLoaders.employees().then((o) => setEmployees(o.employeeId || [])); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStatistics(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (departmentId !== 'all') params.set('departmentId', departmentId);
      if (type === 'time-card' && employeeId !== 'all') params.set('employeeId', employeeId);
      const data = await api<{ columns: string[]; rows: (string | number)[][]; period?: string; statistics?: Record<string, string | number> }>(`/api/reports/${type}?${params}`);
      setColumns(data.columns.map((c, i) => ({ key: String(i), header: c })));
      setRows(data.rows);
      setMeta(data.period || null);
      setStatistics(data.statistics || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التقرير');
    } finally {
      setLoading(false);
    }
  }, [type, from, to, departmentId, employeeId]);

  useEffect(() => { load(); }, [load]);  

  // نحوّل الصفوف إلى بنية DataTable
  const tableRows = rows.map((r, idx) => {
    const obj: Record<string, unknown> = { id: String(idx) };
    r.forEach((cell, i) => { obj[String(i)] = cell; });
    return obj as { id: string } & Record<string, unknown>;
  });

  const tableColumns: Column<{ id: string } & Record<string, unknown>>[] = columns.map((c, i) => ({
    key: c.key,
    header: c.header,
    hideOnMobile: i > 3,
    className: i > 0 ? 'tabular' : '',
  }));

  const exportReport = () => {
    // نصدّر عبر واجهة CSV جاهزة (بيانات التقرير نفسها) — Excel فوري
    const csv = [columns.map((c) => c.header).join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hrhub-report-${type}-${from}-${to}.csv`;
    a.click();
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير ${REPORTS.find((r) => r.key === type)?.label}</title>
      <style>body{font-family:system-ui,sans-serif;padding:20px}h1{color:#1F8A70;font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #cde3dc;padding:6px 8px;text-align:right}th{background:#eef7f4}.meta{color:#666;font-size:12px;margin-bottom:12px}</style></head>
      <body><h1>ADMS FOR HR MANAGMENT — ${REPORTS.find((r) => r.key === type)?.label}</h1>
      <p class="meta">الفترة: ${from} → ${to}${meta ? ` · ${meta}` : ''} · تاريخ الطباعة: ${new Date().toISOString().slice(0, 10)}</p>
      <table><thead><tr>${columns.map((c) => `<th>${c.header}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${String(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="ستة تقارير شاملة بفلاتر — تصدير وطباعة فورية"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportReport}><Download className="h-4 w-4" /> تصدير CSV</Button>
            <Button variant="outline" size="sm" onClick={printReport}><Printer className="h-4 w-4" /> طباعة</Button>
            <Button size="sm" onClick={load}><BarChart3 className="h-4 w-4" /> تحديث</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setType(r.key)}
            className={`rounded-lg border p-2.5 text-right transition-colors ${type === r.key ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}
          >
            <p className={`text-sm font-bold ${type === r.key ? 'text-emerald-800' : ''}`}>{r.label}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{r.desc}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        <Select value={departmentId} onValueChange={setDepartmentId} dir="rtl">
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {type === 'time-card' && (
          <Select value={employeeId} onValueChange={setEmployeeId} dir="rtl">
            <SelectTrigger className="w-56"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" disabled>اختر الموظف</SelectItem>
              {employees.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {meta && <span className="text-xs text-muted-foreground self-center">{meta}</span>}
      </div>

      {type === 'time-card' && statistics && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <p className="text-sm font-bold text-emerald-800 mb-2">إحصائيات الفترة</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              {([['ساعات الوردية', statistics.dutyHours], ['ساعات العمل', statistics.workedHours],
                ['إضافي عادي', statistics.otNormal], ['إضافي راحة (س)', statistics.otWeekend], ['إضافي عطلة (س)', statistics.otHoliday],
                ['تأخير (دقيقة)', statistics.lateMinutes], ['خروج مبكر (دقيقة)', statistics.earlyMinutes],
                ['غياب (ساعة)', statistics.absenceHours], ['إجازة (ساعة)', statistics.leaveHours], ['أيام حضور', statistics.presentDays]] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-bold tabular">{v}</p></div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0"><CardTitle className="text-sm text-muted-foreground">{columns.length} عمود · {rows.length} صف</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={tableColumns} rows={tableRows} loading={loading} emptyText="لا توجد بيانات في النطاق المحدد" maxBodyHeight="62vh" />
        </CardContent>
      </Card>
    </div>
  );
}
