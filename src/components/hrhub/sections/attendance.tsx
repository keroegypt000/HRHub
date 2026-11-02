'use client';

// سجل البصمة الخام (لا يُعدل أبدًا — إضافة فقط) + شاشة السجلات غير المعروفة
// + الحضور اليومي المحسوب مع السجلات المصدرية وزر إعادة المعالجة
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fmtTime, fmtMinutes, STATUS_AR } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { optionLoaders, FieldDef } from '@/components/hrhub/crud-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Download, Link2, RefreshCcw, Plus, Fingerprint, XCircle, Usb, Upload } from 'lucide-react';
import { downloadFile } from '@/lib/client';

interface LogRow extends Record<string, unknown> {
  id: string; sn: string; pin: string; punchTime: string; status: number; verify: number;
  source: string; statusAr: string; verifyAr: string;
  employee?: { id: string; name: string; code: string } | null;
  device?: { sn: string; name: string } | null;
}

interface DailyRow extends Record<string, unknown> {
  id: string; date: string; status: string; statusAr: string;
  firstIn?: string | null; lastOut?: string | null;
  workedMinutes: number; lateMinutes: number; earlyMinutes: number; otMinutes: number; note?: string | null;
  employee?: { id: string; name: string; code: string; department?: { name: string } | null };
  shift?: { name: string; startTime: string; endTime: string } | null;
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 items-center">{children}</div>;
}

function DateFilter({ from, to, setFrom, setTo }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
}) {
  return (
    <>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
    </>
  );
}

// ============================================================
// سجل البصمة
// ============================================================
export function AttendanceLogsSection({ canWrite, isAdmin }: { canWrite: boolean; isAdmin: boolean }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeId, setEmployeeId] = useState('all');
  const [unknown, setUnknown] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState<LogRow | null>(null);
  const [linkEmp, setLinkEmp] = useState('');
  const [emps, setEmps] = useState<{ value: string; label: string }[]>([]);
  const [manual, setManual] = useState({ pin: '', sn: '', punchTime: '', status: '0' });
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
  const [usbOpen, setUsbOpen] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  interface UsbResult { imported: number; failed: number; totalLines: number; deviceSn: string; daysRecomputed: number; pinUnknown: number; message: string; results: { row: number; ok: boolean; message: string }[] }
  const [usbResult, setUsbResult] = useState<UsbResult | null>(null);

  const importUsb = async (file: File) => {
    setUsbBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('sid');
      const res = await fetch('/api/import/usb', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الاستيراد');
      setUsbResult(data);
      toast.success(data.message);
      load(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل استيراد ملف USB');
    } finally {
      setUsbBusy(false);
    }
  };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '100' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (employeeId !== 'all') params.set('employeeId', employeeId);
      if (unknown) params.set('unknown', '1');
      const data = await api<{ rows: LogRow[]; total: number }>(`/api/attendance-logs?${params}`);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [page, from, to, employeeId, unknown]);

  useEffect(() => { load(1); }, [from, to, employeeId, unknown]);  
  useEffect(() => { load(page); }, [page]);  

  useEffect(() => {
    optionLoaders.employees().then((o) => setEmps(o.employeeId || []));
    optionLoaders.devices().then((o) => setDevices(o.deviceId || []));
  }, []);

  const addManual = async () => {
    try {
      await api('/api/attendance-logs', {
        method: 'POST',
        body: JSON.stringify({ mode: 'manual', ...manual }),
      });
      toast.success('أُضيف السجل اليدوي وأُعيدت معالجة اليوم');
      setManualOpen(false);
      load(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإضافة');
    }
  };

  const linkPin = async () => {
    if (!linkOpen || !linkEmp) return;
    try {
      const res = await api<{ linked: number }>('/api/attendance-logs', {
        method: 'POST',
        body: JSON.stringify({ mode: 'link', pin: linkOpen.pin, employeeId: linkEmp }),
      });
      toast.success(`تم ربط ${res.linked} سجلة بالموظف وإعادة معالجتها`);
      setLinkOpen(null);
      load(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الربط');
    }
  };

  const deleteLog = async (id: string) => {
    try {
      await api('/api/attendance-logs', { method: 'DELETE', body: JSON.stringify({ id }) });
      toast.success('حُذف السجل الخام (حق المدير) وأُعيدت المعالجة');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحذف');
    }
  };

  const columns: Column<LogRow>[] = [
    { key: 'time', header: 'الوقت', render: (r) => <span className="tabular">{fmtDate(r.punchTime)} {fmtTime(r.punchTime)}</span> },
    { key: 'emp', header: 'الموظف', render: (r) => r.employee ? `${r.employee.name} (${r.employee.code})` : <span className="text-amber-700 font-medium">Pin غير معروف: {r.pin}</span> },
    { key: 'device', header: 'الجهاز', render: (r) => r.device?.name || r.sn, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <span>{r.statusAr}</span> },
    { key: 'verify', header: 'التحقق', render: (r) => r.verifyAr, hideOnMobile: true },
    { key: 'source', header: 'المصدر', render: (r) => <span className="text-xs uppercase text-muted-foreground">{r.source}</span> },
    ...(linkOpen !== undefined ? [{
      key: 'actions', header: '',
      render: (r: LogRow) => (
        <div className="flex gap-1">
          {!r.employee && (
            <Button variant="outline" size="sm" className="h-7 text-xs text-emerald-700" onClick={() => { setLinkOpen(r); setLinkEmp(''); }}>
              <Link2 className="h-3 w-3" /> ربط
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" title="حذف سجل خام (مدير فقط)"
              onClick={() => { if (confirm('حذف سجل خام نهائيًا؟ يُسمح للمدير فقط ويُسجل في التدقيق.')) deleteLog(r.id); }}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    } as Column<LogRow>] : []),
  ];

  return (
    <div>
      <PageHeader
        title="سجل البصمة"
        subtitle="السجلات الخام لا تُعدل أبدًا (إضافة فقط) — قيد فريد يمنع التكرار مهما أرسل الجهاز"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadFile(`/api/export?entity=attendance-logs${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, 'hrhub-attendance-logs.xlsx')}>
              <Download className="h-4 w-4" /> تصدير
            </Button>
            {canWrite && (
              <Button variant="outline" size="sm" className="text-violet-700 border-violet-300" onClick={() => setUsbOpen(true)}>
                <Usb className="h-4 w-4" /> استيراد من USB
              </Button>
            )}
            {canWrite && (
              <Button size="sm" onClick={() => setManualOpen(true)}>
                <Plus className="h-4 w-4" /> سجل يدوي
              </Button>
            )}
          </>
        }
      />

      <FilterBar>
        <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Select value={employeeId} onValueChange={setEmployeeId} dir="rtl">
          <SelectTrigger className="w-48"><SelectValue placeholder="كل الموظفين" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموظفين</SelectItem>
            {emps.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={unknown ? 'default' : 'outline'} size="sm" onClick={() => setUnknown(!unknown)}>
          <Fingerprint className="h-4 w-4" /> غير المعروفة فقط
        </Button>
        <Button variant="outline" size="sm" onClick={() => load(1)}>تحديث</Button>
      </FilterBar>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} loading={loading} page={page} total={total} limit={100} onPage={setPage}
          emptyText={unknown ? 'لا توجد سجلات غير معروفة — كل السجلات مربوطة بموظفين 🎉' : 'لا توجد سجلات — اضبط جهاز ZKTeco على ADMS'} />
      </div>

      {/* حوار سجل يدوي */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>تسجيل سجل بصمة يدوي</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1.5">الرقم الوظيفي PIN</Label>
              <Input value={manual.pin} onChange={(e) => setManual({ ...manual, pin: e.target.value })} placeholder="1001" />
            </div>
            <div>
              <Label className="mb-1.5">الجهاز (SN)</Label>
              <Select value={manual.sn} onValueChange={(v) => setManual({ ...manual, sn: v })} dir="rtl">
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الجهاز" /></SelectTrigger>
                <SelectContent>{devices.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">وقت السجلة (توقيت الكويت)</Label>
                <Input type="datetime-local" value={manual.punchTime} onChange={(e) => setManual({ ...manual, punchTime: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5">الحالة</Label>
                <Select value={manual.status} onValueChange={(v) => setManual({ ...manual, status: v })} dir="rtl">
                  <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">دخول</SelectItem><SelectItem value="1">خروج</SelectItem>
                    <SelectItem value="2">خروج استراحة</SelectItem><SelectItem value="3">عودة</SelectItem>
                    <SelectItem value="4">دخول إضافي</SelectItem><SelectItem value="5">خروج إضافي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>إلغاء</Button>
            <Button onClick={addManual}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار ربط pin بموظف */}
      <Dialog open={!!linkOpen} onOpenChange={(o) => !o && setLinkOpen(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>ربط Pin «{linkOpen?.pin}» بموظف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيُربط كل السجلات غير المعروفة بنفس الـ pin ويُعاد حساب الحضور.</p>
          <Select value={linkEmp} onValueChange={setLinkEmp} dir="rtl">
            <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
            <SelectContent>{emps.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(null)}>إلغاء</Button>
            <Button onClick={linkPin} disabled={!linkEmp}>ربط</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار استيراد ملف USB من الجهاز */}
      <Dialog open={usbOpen} onOpenChange={(o) => { setUsbOpen(o); if (!o) setUsbResult(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Usb className="h-4 w-4 text-violet-700" /> استيراد بصمات من فلاشة الجهاز (USB)</DialogTitle></DialogHeader>
          {!usbResult ? (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-1 text-violet-900">
                <p className="font-bold">من قائمة الجهاز:</p>
                <p>1. أدخل فلاشة USB في الجهاز ← USB Manager → Download → Attendance Data.</p>
                <p>2. أخرج الفلاشة وارفع الملف الناتج هنا (اسمه مثل <span className="font-mono">1_attlog.dat</span> أو <span className="font-mono">ATTLOG.TXT</span>).</p>
              </div>
              <label className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 ${usbBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload className="h-6 w-6 text-emerald-600" />
                <span className="font-medium text-emerald-700">{usbBusy ? 'جارٍ الاستيراد...' : 'اختر ملف بصمات USB'}</span>
                <span className="text-xs text-muted-foreground">.dat أو .txt — حتى 20 ميجابايت</span>
                <input type="file" accept=".dat,.txt,text/plain" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importUsb(f); }} />
              </label>
              <p className="text-xs text-muted-foreground">السجلات تُدرج بمصدر «USB» مع منع التكرار — إعادة رفع نفس الملف آمن تمامًا، ويُعاد حساب الحضور تلقائيًا.</p>
            </div>
          ) : (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-200 text-emerald-900 font-medium">{usbResult.message}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">سطور الملف</p><p className="tabular font-bold">{usbResult.totalLines}</p></div>
                <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">مستوردة جديدة</p><p className="tabular font-bold text-emerald-700">{usbResult.imported}</p></div>
                <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">فشل/مكرر</p><p className="tabular font-bold text-amber-700">{usbResult.failed}</p></div>
                <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">pin غير معروف</p><p className="tabular font-bold">{usbResult.pinUnknown}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">SN: {usbResult.deviceSn} · أعيد حساب {usbResult.daysRecomputed} يوم حضور</p>
              {usbResult.results.filter((r) => !r.ok).length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1">
                  {usbResult.results.filter((r) => !r.ok).slice(0, 100).map((r, i) => (
                    <p key={i} className="text-xs text-amber-800 flex gap-2"><XCircle className="h-3 w-3 mt-0.5 shrink-0" /> سطر {r.row}: {r.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsbOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// الحضور اليومي
// ============================================================
export function DailyAttendanceSection({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [sourceLogs, setSourceLogs] = useState<DailyRow | null>(null);
  const [sourceData, setSourceData] = useState<{ rows: LogRow[] } | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '200', from, to });
      if (status !== 'all') params.set('status', status);
      if (departmentId !== 'all') params.set('departmentId', departmentId);
      const data = await api<{ rows: DailyRow[]; total: number }>(`/api/daily-attendance?${params}`);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [from, to, status, departmentId]);

  useEffect(() => { setPage(1); load(1); }, [from, to, status, departmentId]);  
  useEffect(() => { load(page); }, [page]);  
  useEffect(() => { optionLoaders.departments().then((o) => setDepartments(o.departmentId || [])); }, []);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const res = await api<{ days: number }>('/api/attendance/recompute', {
        method: 'POST', body: JSON.stringify({ from, to }),
      });
      toast.success(`أُعيدت معالجة ${res.days} يومًا بنجاح`);
      load(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل إعادة المعالجة');
    } finally {
      setRecomputing(false);
    }
  };

  const showSources = async (row: DailyRow) => {
    setSourceLogs(row);
    setSourceData(null);
    try {
      const data = await api<{ rows: LogRow[] }>(`/api/attendance-logs?from=${fmtDate(row.date).slice(0, 10)}&to=${fmtDate(row.date).slice(0, 10)}&employeeId=${row.employee?.id}&limit=50`);
      setSourceData(data);
    } catch {
      setSourceData({ rows: [] });
    }
  };

  const columns: Column<DailyRow>[] = [
    { key: 'date', header: 'التاريخ', render: (r) => <span className="tabular">{fmtDate(r.date)}</span> },
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-muted-foreground">{r.employee?.department?.name}</p></div> },
    { key: 'shift', header: 'الوردية', render: (r) => r.shift ? `${r.shift.name}` : 'افتراضية', hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'in', header: 'دخول', render: (r) => <span className="tabular">{r.firstIn ? fmtTime(r.firstIn) : '—'}</span> },
    { key: 'out', header: 'خروج', render: (r) => <span className="tabular">{r.lastOut ? fmtTime(r.lastOut) : '—'}</span> },
    { key: 'work', header: 'عمل', render: (r) => <span className="tabular">{fmtMinutes(r.workedMinutes)}</span>, hideOnMobile: true },
    { key: 'late', header: 'تأخير', render: (r) => r.lateMinutes ? <span className="text-amber-700 tabular font-medium">{r.lateMinutes}د</span> : <span className="text-muted-foreground">—</span> },
    { key: 'ot', header: 'إضافي', render: (r) => r.otMinutes ? <span className="text-violet-700 tabular font-medium">{r.otMinutes}د</span> : <span className="text-muted-foreground">—</span>, hideOnMobile: true },
    {
      key: 'src', header: '',
      render: (r) => (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => showSources(r)}>
          <Fingerprint className="h-3 w-3" /> السجلات المصدرية
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الحضور اليومي"
        subtitle="النتيجة المحسوبة آليًا من السجلات الخام بقواعد الورديات المعلنة — أولوية اليوم: عطلة ← إجازة ← راحة ← عمل"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadFile(`/api/export?entity=daily-attendance&from=${from}&to=${to}${status !== 'all' ? `&status=${status}` : ''}`, `hrhub-daily-${from}-${to}.xlsx`)}>
              <Download className="h-4 w-4" /> تصدير
            </Button>
            {canWrite && (
              <Button size="sm" onClick={recompute} disabled={recomputing}>
                <RefreshCcw className={`h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} /> إعادة معالجة الفترة
              </Button>
            )}
          </>
        }
      />

      <FilterBar>
        <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Select value={status} onValueChange={setStatus} dir="rtl">
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_AR).filter(([k]) => ['present', 'late', 'half_day', 'absent', 'leave', 'holiday', 'weekend', 'missed_punch'].includes(k)).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentId} onValueChange={setDepartmentId} dir="rtl">
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} loading={loading} page={page} total={total} limit={200} onPage={setPage} maxBodyHeight="65vh" />
      </div>

      {/* السجلات المصدرية — الشفافية أساس ثقة المحاسب */}
      <Dialog open={!!sourceLogs} onOpenChange={(o) => !o && setSourceLogs(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>السجلات المصدرية — {sourceLogs?.employee?.name} ({fmtDate(sourceLogs?.date)})</DialogTitle>
          </DialogHeader>
          {!sourceData ? <p className="text-center py-6 text-muted-foreground">جارٍ التحميل...</p> : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {sourceData.rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد سجلات خام في هذا اليوم — الحالة مشتقة من (عطلة/إجازة/راحة/غياب).</p>}
              {sourceData.rows.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                  <span className="tabular font-bold">{fmtTime(l.punchTime)}</span>
                  <span>{l.statusAr}</span>
                  <span className="text-xs text-muted-foreground">{l.verifyAr} · {l.device?.name || l.sn} · {l.source}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
