'use client';

// شريط فلاتر موحد لكل الجداول في النظام: فترة (مع اختصارات) + قسم + موظف + بحث
// يكتشف تلقائيًا الأبعاد الموجودة في البيانات (موظف/قسم/تاريخ) ويُظهر فلاترها فقط
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeePicker, PickerEmployee } from '@/components/hrhub/employee-picker';
import { Search, RotateCcw, Filter } from 'lucide-react';

export interface FilterOptions { search?: boolean; date?: boolean; employee?: boolean; department?: boolean }
type Row = Record<string, unknown>;

const DATE_KEYS = ['date', 'punchTime', 'fromDate', 'startDate', 'departureDate', 'issueDate', 'expiryDate', 'requestDate'];
const ALL = 'all';

const kuwaitKey = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
function toKey(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : kuwaitKey(d);
}

function empOf(r: Row): PickerEmployee | null {
  const e = r.employee as { id?: string; name?: string; code?: string; departmentId?: string | null; department?: { id?: string } | null } | null | undefined;
  if (e?.id && e.name) return { id: e.id, name: e.name, code: e.code || '', departmentId: e.departmentId || e.department?.id || null };
  if (typeof r.employeeId === 'string' && typeof r.employeeName === 'string') return { id: r.employeeId, name: r.employeeName, code: String(r.employeeCode || ''), departmentId: null };
  return null;
}
function deptOf(r: Row): { id: string; name: string } | null {
  const e = r.employee as { department?: { id?: string; name?: string } | null } | null | undefined;
  const d = (e?.department || r.department) as { id?: string; name?: string } | null | undefined;
  if (d?.id && d.name) return { id: d.id, name: d.name };
  return null;
}
/** نص البحث: كل القيم النصية والرقمية في الصف وما بداخله مستوى واحد */
function haystack(r: Row): string {
  const out: string[] = [];
  const add = (v: unknown, depth: number) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' || typeof v === 'number') { out.push(String(v)); return; }
    if (depth < 2 && typeof v === 'object' && !Array.isArray(v)) for (const x of Object.values(v as Row)) add(x, depth + 1);
  };
  add(r, 0);
  return out.join(' ').toLowerCase();
}

function preset(k: string): [string, string] {
  const today = kuwaitKey(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  const add = (n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return key(x); };
  switch (k) {
    case 'today': return [today, today];
    case 'yesterday': return [add(-1), add(-1)];
    case 'week': return [add(-((d.getUTCDay() + 7) % 7)), today]; // من الأحد
    case 'month': return [`${today.slice(0, 7)}-01`, today];
    case 'lastMonth': {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const y = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return [key(x), key(y)];
    }
    case 'year': return [`${today.slice(0, 4)}-01-01`, today];
    default: return ['', ''];
  }
}
const PRESETS: [string, string][] = [['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'], ['year', 'هذه السنة']];

export function useTableFilters<T>(rows: T[], opts: FilterOptions = {}) {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);

  const meta = useMemo(() => {
    const emps = new Map<string, PickerEmployee>();
    const depts = new Map<string, string>();
    let dateKey: string | null = null;
    for (const raw of rows as unknown as Row[]) {
      const e = empOf(raw); if (e) emps.set(e.id, e);
      const d = deptOf(raw); if (d) { depts.set(d.id, d.name); if (e && !e.departmentId) e.departmentId = d.id; }
      if (!dateKey) dateKey = DATE_KEYS.find((k) => toKey(raw[k])) || null;
    }
    return {
      employees: [...emps.values()].sort((a, b) => a.name.localeCompare(b.name)),
      departments: [...depts.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      dateKey,
    };
  }, [rows]);

  const show = {
    search: opts.search !== false,
    date: opts.date !== false && !!meta.dateKey,
    department: opts.department !== false && meta.departments.length > 1,
    employee: opts.employee !== false && meta.employees.length > 1,
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows as unknown as Row[]).filter((r) => {
      if (show.employee && employeeId !== ALL && empOf(r)?.id !== employeeId) return false;
      if (show.department && departmentId !== ALL && deptOf(r)?.id !== departmentId) return false;
      if (show.date && meta.dateKey && (from || to)) {
        const k = toKey(r[meta.dateKey]);
        if (!k || (from && k < from) || (to && k > to)) return false;
      }
      if (s && !haystack(r).includes(s)) return false;
      return true;
    }) as unknown as T[];
  }, [rows, search, from, to, departmentId, employeeId, show.employee, show.department, show.date, meta.dateKey]);

  const active = !!(search || from || to || departmentId !== ALL || employeeId !== ALL);
  const reset = () => { setSearch(''); setFrom(''); setTo(''); setDepartmentId(ALL); setEmployeeId(ALL); };
  const changeDept = (v: string) => {
    setDepartmentId(v);
    if (v !== ALL && employeeId !== ALL && meta.employees.find((e) => e.id === employeeId)?.departmentId !== v) setEmployeeId(ALL);
  };

  const any = show.search || show.date || show.department || show.employee;
  const bar = any ? (
    <div className="mb-2 space-y-2 rounded-lg border bg-muted/20 p-2">
      {show.date && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {PRESETS.map(([k, label]) => {
            const [a, b] = preset(k);
            const on = a === from && b === to;
            return (
              <button key={k} type="button" onClick={() => { setFrom(a); setTo(b); }}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-background hover:border-emerald-400'}`}>
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {show.date && (
          <>
            <div><p className="mb-0.5 text-[11px] text-muted-foreground">من</p><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" dir="ltr" /></div>
            <div><p className="mb-0.5 text-[11px] text-muted-foreground">إلى</p><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" dir="ltr" /></div>
          </>
        )}
        {show.department && (
          <div>
            <p className="mb-0.5 text-[11px] text-muted-foreground">القسم</p>
            <Select value={departmentId} onValueChange={changeDept} dir="rtl">
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الأقسام</SelectItem>
                {meta.departments.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {show.employee && (
          <div>
            <p className="mb-0.5 text-[11px] text-muted-foreground">الموظف</p>
            <EmployeePicker className="h-8 w-52"
              employees={departmentId === ALL ? meta.employees : meta.employees.filter((e) => e.departmentId === departmentId)}
              value={employeeId} onChange={setEmployeeId} />
          </div>
        )}
        {show.search && (
          <div className="min-w-44 flex-1">
            <p className="mb-0.5 text-[11px] text-muted-foreground">بحث</p>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم، رقم، تاريخ، حالة..." className="h-8 pr-8" />
            </div>
          </div>
        )}
        {active && (
          <Button variant="ghost" size="sm" className="h-8" onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> مسح الفلاتر</Button>
        )}
        <span className="mr-auto self-center text-xs text-muted-foreground tabular">
          {active ? `${filtered.length} من ${rows.length}` : `${rows.length} سجل`}
        </span>
      </div>
    </div>
  ) : null;

  return { filtered, bar, active, reset };
}

// ============================================================
// شريط فلاتر للشاشات التي تفلتر من السيرفر (الحضور اليومي، سجل البصمة) — نفس الشكل
// ============================================================

/** قائمة الموظفين النشطين (للاختيار بالبحث) + الأقسام */
export function useEmployeeDirectory() {
  const [employees, setEmployees] = useState<PickerEmployee[]>([]);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ rows: { id: string; name: string; code: string; status: string; department?: { id: string } | null }[] }>('/api/employees?limit=2000')
      .then((d) => setEmployees(d.rows.filter((e) => e.status !== 'terminated' && e.status !== 'deceased')
        .map((e) => ({ id: e.id, name: e.name, code: e.code, departmentId: e.department?.id || null }))))
      .catch(() => {});
    api<{ rows: { id: string; name: string }[] }>('/api/departments?limit=500')
      .then((d) => setDepartments(d.rows.map((r) => ({ value: r.id, label: r.name })))).catch(() => {});
  }, []);
  return { employees, departments };
}

export function ServerFilterBar({ from, to, setFrom, setTo, departmentId, setDepartmentId, employeeId, setEmployeeId, onReset, children }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  departmentId?: string; setDepartmentId?: (v: string) => void;
  employeeId: string; setEmployeeId: (v: string) => void;
  onReset?: () => void; children?: React.ReactNode;
}) {
  const { employees, departments } = useEmployeeDirectory();
  const dep = departmentId ?? ALL;
  const list = dep === ALL ? employees : employees.filter((e) => e.departmentId === dep);
  const changeDept = (v: string) => {
    setDepartmentId?.(v);
    if (v !== ALL && employeeId !== ALL && employees.find((e) => e.id === employeeId)?.departmentId !== v) setEmployeeId(ALL);
  };
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {PRESETS.map(([k, label]) => {
          const [a, b] = preset(k);
          const on = a === from && b === to;
          return (
            <button key={k} type="button" onClick={() => { setFrom(a); setTo(b); }}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-background hover:border-emerald-400'}`}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div><p className="mb-0.5 text-[11px] text-muted-foreground">من</p><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" dir="ltr" /></div>
        <div><p className="mb-0.5 text-[11px] text-muted-foreground">إلى</p><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" dir="ltr" /></div>
        {setDepartmentId && (
          <div>
            <p className="mb-0.5 text-[11px] text-muted-foreground">القسم</p>
            <Select value={dep} onValueChange={changeDept} dir="rtl">
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الأقسام</SelectItem>
                {departments.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <p className="mb-0.5 text-[11px] text-muted-foreground">الموظف</p>
          <EmployeePicker className="h-8 w-52" employees={list} value={employeeId} onChange={setEmployeeId} />
        </div>
        {children}
        {onReset && <Button variant="ghost" size="sm" className="h-8" onClick={onReset}><RotateCcw className="h-3.5 w-3.5" /> مسح الفلاتر</Button>}
      </div>
    </div>
  );
}
