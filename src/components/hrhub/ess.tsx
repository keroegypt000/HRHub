'use client';

// بوابة الموظف (Employee Self Service) — واجهة موبايل أولًا لحساب role=employee
// الرئيسية (ملفي + أرصدة الإجازات + آخر قسيمة) · طلباتي · قسائمي · حضوري · موافقاتي · حسابي
import { useCallback, useEffect, useState } from 'react';
import { api, fmtKWD, fmtDate, fmtTime, fmtMinutes, STATUS_AR, Me } from '@/lib/client';
import { REQUEST_TYPES, requestTypeLabel, REQUEST_STATUS_AR, parseSteps } from '@/lib/requests';
import { payslipDoc, printHtml, PayslipDocData } from '@/components/hrhub/print-docs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Home, ClipboardList, Wallet, CalendarCheck2, CheckSquare, UserRound, LogOut, Plus, Printer, Palmtree, Stethoscope,
} from 'lucide-react';

type Tab = 'home' | 'requests' | 'payslips' | 'attendance' | 'approvals' | 'account';

interface EssHome {
  companyName: string;
  employee: {
    id: string; code: string; name: string; email: string | null; phone: string | null;
    department: string | null; position: string | null; manager: string | null;
    hireDate: string | null; nationality: string | null; weeklyOff: string;
  };
  annual: { accrued: number; used: number; balance: number; annualQuota: number };
  balances: { id: string; name: string; quota: number; used: number; balance: number }[];
  lastPayslip: { id: string; period: string; netPay: number } | null;
  pendingRequests: number;
}

interface RequestRow {
  id: string; type: string; status: string; payload: string | null; steps: string; createdAt: string;
  employee?: { name: string; code: string; department?: { name: string } | null };
}

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'الرئيسية', icon: Home },
  { key: 'requests', label: 'طلباتي', icon: ClipboardList },
  { key: 'payslips', label: 'قسائمي', icon: Wallet },
  { key: 'attendance', label: 'حضوري', icon: CalendarCheck2 },
  { key: 'approvals', label: 'موافقاتي', icon: CheckSquare },
  { key: 'account', label: 'حسابي', icon: UserRound },
];

const statusTone = (s: string) =>
  s === 'approved' ? 'bg-emerald-100 text-emerald-800' : s === 'rejected' ? 'bg-red-100 text-red-800'
    : s === 'cancelled' ? 'bg-zinc-100 text-zinc-600' : 'bg-amber-100 text-amber-800';

function payloadText(payload: string | null): string {
  try {
    const p = JSON.parse(payload || '{}') as Record<string, unknown>;
    const parts: string[] = [];
    if (p.fromDate) parts.push(`${fmtDate(String(p.fromDate))} → ${fmtDate(String(p.toDate || p.fromDate))}`);
    if (p.amount) parts.push(`${fmtKWD(Number(p.amount))} د.ك${p.installments ? ` / ${p.installments} قسط` : ''}`);
    if (p.description) parts.push(String(p.description));
    if (p.purpose) parts.push(String(p.purpose));
    return parts.join(' — ');
  } catch {
    return '';
  }
}

export function EssApp({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [home, setHome] = useState<EssHome | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [approvalsCount, setApprovalsCount] = useState(0);

  const [reloadKey, setReloadKey] = useState(0);
  const loadHome = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    api<EssHome>('/api/ess/me')
      .then((data) => { setHome(data); setHomeError(null); })
      .catch((e) => setHomeError(e instanceof Error ? e.message : 'تعذّر التحميل'));
    api<{ rows: RequestRow[] }>('/api/ess/approvals').then((d) => setApprovalsCount(d.rows.length)).catch(() => {});
  }, [reloadKey]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24" dir="rtl">
      <header className="sticky top-0 z-10 bg-emerald-600 text-white shadow">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] opacity-80">{home?.companyName || 'بوابة الموظف'}</p>
            <p className="font-bold">أهلًا، {home?.employee.name.split(' ')[0] || me.name}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-white hover:bg-emerald-700" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {homeError && <Card><CardContent className="p-4 text-sm text-red-700">{homeError}</CardContent></Card>}
        {tab === 'home' && <HomeTab home={home} onNew={() => setTab('requests')} onPayslips={() => setTab('payslips')} />}
        {tab === 'requests' && <RequestsTab onChanged={loadHome} />}
        {tab === 'payslips' && <PayslipsTab companyName={home?.companyName || ''} />}
        {tab === 'attendance' && <AttendanceTab />}
        {tab === 'approvals' && <ApprovalsTab onChanged={loadHome} />}
        {tab === 'account' && <AccountTab home={home} me={me} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl grid grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', tab === t.key ? 'text-emerald-700 font-bold' : 'text-muted-foreground')}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
              {t.key === 'approvals' && approvalsCount > 0 && (
                <span className="absolute top-1 left-1/2 ms-3 rounded-full bg-red-600 text-white text-[10px] px-1.5">{approvalsCount}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HomeTab({ home, onNew, onPayslips }: { home: EssHome | null; onNew: () => void; onPayslips: () => void }) {
  if (!home) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-28" /></div>;
  const e = home.employee;
  return (
    <>
      <Card>
        <CardContent className="p-4 flex gap-4 items-center">
          <div className="h-16 w-16 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black">
            {e.name.trim().charAt(0)}
          </div>
          <div className="text-sm leading-6 min-w-0">
            <p className="font-bold text-base truncate">{e.name}</p>
            <p className="text-emerald-700">{e.position || '—'}</p>
            <p className="text-muted-foreground">#{e.code} · {e.department || '—'}</p>
            {e.manager && <p className="text-muted-foreground">المدير المباشر: {e.manager}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Palmtree className="h-5 w-5 mx-auto text-emerald-600" />
            <p className="text-xs text-muted-foreground mt-1">رصيد الإجازة السنوية</p>
            <p className="text-2xl font-black tabular">{home.annual.balance.toFixed(3)}</p>
            <p className="text-[11px] text-muted-foreground">مستخدم {home.annual.used} يوم</p>
          </CardContent>
        </Card>
        {home.balances.slice(0, 1).map((b) => (
          <Card key={b.id}>
            <CardContent className="p-4 text-center">
              <Stethoscope className="h-5 w-5 mx-auto text-sky-600" />
              <p className="text-xs text-muted-foreground mt-1">{b.name}</p>
              <p className="text-2xl font-black tabular">{b.balance}</p>
              <p className="text-[11px] text-muted-foreground">من {b.quota} يوم هذه السنة</p>
            </CardContent>
          </Card>
        ))}
        {home.balances.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center">
              <ClipboardList className="h-5 w-5 mx-auto text-amber-600" />
              <p className="text-xs text-muted-foreground mt-1">طلبات قيد الموافقة</p>
              <p className="text-2xl font-black tabular">{home.pendingRequests}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-bold">قسيمة الراتب</p>
            <p className="text-sm text-muted-foreground">
              {home.lastPayslip ? `آخر قسيمة ${home.lastPayslip.period}: ${fmtKWD(home.lastPayslip.netPay)} د.ك` : 'لا توجد قسائم منشورة بعد'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onPayslips}>عرض</Button>
        </CardContent>
      </Card>

      <Button className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700" onClick={onNew}>
        <Plus className="h-5 w-5" /> طلب جديد (إجازة / سلفة / شهادة ...)
      </Button>
    </>
  );
}

function RequestsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  useEffect(() => {
    api<{ rows: RequestRow[] }>('/api/ess/requests')
      .then((data) => setRows(data.rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'فشل التحميل'));
  }, [reloadKey]);

  const cancel = async (id: string) => {
    try {
      await api(`/api/requests/${id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
      toast.success('أُلغي الطلب');
      load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الإلغاء'); }
  };

  return (
    <>
      <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> طلب جديد</Button>
      {!rows ? <Skeleton className="h-40" /> : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات بعد</p>
      ) : rows.map((r) => {
        const steps = parseSteps(r.steps);
        return (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{requestTypeLabel(r.type)}</p>
                <Badge className={statusTone(r.status)}>{REQUEST_STATUS_AR[r.status] || r.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{payloadText(r.payload)}</p>
              <div className="flex flex-wrap gap-1.5">
                {steps.map((s, i) => (
                  <span key={i} className={cn('text-[11px] rounded-full px-2 py-0.5 border',
                    s.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : s.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-zinc-50 text-zinc-600')}>
                    {i + 1}. {s.name} {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : '…'}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{fmtDate(r.createdAt)}</span>
                {r.status === 'pending' && <Button variant="ghost" size="sm" className="text-red-700 h-7" onClick={() => cancel(r.id)}>إلغاء الطلب</Button>}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {open && <NewRequestDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); onChanged(); }} />}
    </>
  );
}

function NewRequestDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ type: 'vacation' });
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const def = REQUEST_TYPES.find((t) => t.value === form.type)!;
  useEffect(() => { api<{ rows: { id: string; name: string }[] }>('/api/ess/leave-types').then((d) => setTypes(d.rows)).catch(() => {}); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await api('/api/ess/requests', { method: 'POST', body: JSON.stringify(form) });
      toast.success('أُرسل الطلب لسلسلة الموافقات');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الإرسال'); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>طلب جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">نوع الطلب</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ type: v })} dir="rtl">
              <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>{REQUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {def.fields.includes('leaveType') && (
            <div>
              <Label className="mb-1.5 block">نوع الإجازة</Label>
              <Select value={form.leaveTypeId || ''} onValueChange={(v) => setForm({ ...form, leaveTypeId: v })} dir="rtl">
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر نوع الإجازة" /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {def.fields.includes('dateRange') && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1.5 block">من</Label><Input type="date" value={form.fromDate || ''} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></div>
              <div><Label className="mb-1.5 block">إلى</Label><Input type="date" value={form.toDate || ''} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></div>
            </div>
          )}
          {def.fields.includes('amount') && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1.5 block">المبلغ (د.ك)</Label><Input type="number" step="any" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label className="mb-1.5 block">عدد الأقساط</Label><Input type="number" value={form.installments || ''} onChange={(e) => setForm({ ...form, installments: e.target.value })} /></div>
            </div>
          )}
          {(def.fields.includes('description') || def.fields.includes('purpose')) && (
            <div>
              <Label className="mb-1.5 block">{def.fields.includes('purpose') ? 'الغرض (الجهة الموجه لها)' : 'التفاصيل'}</Label>
              <Textarea rows={2} value={form.description || form.purpose || ''}
                onChange={(e) => setForm({ ...form, [def.fields.includes('purpose') ? 'purpose' : 'description']: e.target.value })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'جارٍ الإرسال...' : 'إرسال'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayslipsTab({ companyName }: { companyName: string }) {
  const [rows, setRows] = useState<{ id: string; netPay: number; totalEarnings: number; totalDeductions: number; period: { name: string } }[] | null>(null);
  useEffect(() => {
    api<{ rows: NonNullable<typeof rows> }>('/api/ess/payslips').then((d) => setRows(d.rows)).catch((e) => toast.error(e.message));
  }, []);
  const print = async (id: string) => {
    try {
      const slip = await api<PayslipDocData>(`/api/ess/payslips/${id}`);
      printHtml(payslipDoc(slip, companyName));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الفتح'); }
  };
  if (!rows) return <Skeleton className="h-40" />;
  if (!rows.length) return <p className="text-center text-sm text-muted-foreground py-8">لا توجد قسائم منشورة بعد — تظهر بعد اعتماد الرواتب</p>;
  return (
    <>
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-bold">{r.period.name}</p>
              <p className="text-xs text-muted-foreground">مكملات {fmtKWD(r.totalEarnings)} · استقطاعات {fmtKWD(r.totalDeductions)}</p>
              <p className="text-emerald-700 font-black tabular">{fmtKWD(r.netPay)} د.ك</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => print(r.id)}><Printer className="h-4 w-4" /> عرض / طباعة</Button>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function AttendanceTab() {
  const [month, setMonth] = useState(() => new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 7));
  const [rows, setRows] = useState<{ date: string; firstIn: string | null; lastOut: string | null; workedMinutes: number; lateMinutes: number; otMinutes: number; status: string }[] | null>(null);
  useEffect(() => {
    api<{ rows: NonNullable<typeof rows> }>(`/api/ess/attendance?month=${month}`).then((d) => setRows(d.rows)).catch((e) => toast.error(e.message));
  }, [month]);
  return (
    <>
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      {!rows ? <Skeleton className="h-40" /> : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">لا يوجد حضور مسجل لهذا الشهر</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {rows.map((r) => (
              <div key={r.date} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="tabular w-24">{fmtDate(r.date)}</span>
                <span className="tabular text-muted-foreground">{fmtTime(r.firstIn)} – {fmtTime(r.lastOut)}</span>
                <span className="tabular">{r.workedMinutes ? fmtMinutes(r.workedMinutes) : ''}</span>
                <Badge variant="outline" className="text-[11px]">{STATUS_AR[r.status] || r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ApprovalsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  useEffect(() => {
    api<{ rows: RequestRow[] }>('/api/ess/approvals')
      .then((data) => setRows(data.rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'فشل التحميل'));
  }, [reloadKey]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    try {
      await api(`/api/requests/${id}`, { method: 'POST', body: JSON.stringify({ action, comment: comment[id] || undefined }) });
      toast.success(action === 'approve' ? 'تم الاعتماد' : 'تم الرفض');
      load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الإجراء'); }
  };

  if (!rows) return <Skeleton className="h-40" />;
  if (!rows.length) return <p className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات بانتظار موافقتك</p>;
  return (
    <>
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-4 space-y-2">
            <p className="font-bold text-sm">{requestTypeLabel(r.type)} — {r.employee?.name} ({r.employee?.code})</p>
            <p className="text-sm text-muted-foreground">{payloadText(r.payload)}</p>
            <Input placeholder="ملاحظة (اختياري)" value={comment[r.id] || ''} onChange={(e) => setComment({ ...comment, [r.id]: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(r.id, 'approve')}>اعتماد</Button>
              <Button variant="outline" className="text-red-700" onClick={() => act(r.id, 'reject')}>رفض</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function AccountTab({ home, me }: { home: EssHome | null; me: Me }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const change = async () => {
    if (form.newPassword.length < 8) { toast.error('كلمة السر الجديدة 8 أحرف على الأقل'); return; }
    if (form.newPassword !== form.confirm) { toast.error('تأكيد كلمة السر غير مطابق'); return; }
    setSaving(true);
    try {
      await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ mode: 'self', currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      toast.success('تم تغيير كلمة السر');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل التغيير'); } finally { setSaving(false); }
  };
  const e = home?.employee;
  return (
    <>
      <Card>
        <CardContent className="p-4 text-sm space-y-1.5">
          <p className="font-bold mb-1">بياناتي</p>
          {[
            ['اسم المستخدم', me.username], ['الرقم الوظيفي', e?.code], ['القسم', e?.department], ['المسمى', e?.position],
            ['تاريخ التعيين', e?.hireDate ? fmtDate(e.hireDate) : '—'], ['الجنسية', e?.nationality],
            ['يوم الراحة', e?.weeklyOff || 'حسب الوردية'], ['البريد', e?.email], ['الهاتف', e?.phone],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v || '—'}</span></div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">لتعديل بياناتك راجع الموارد البشرية</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-bold">تغيير كلمة السر</p>
          <Input type="password" placeholder="كلمة السر الحالية" value={form.currentPassword} onChange={(ev) => setForm({ ...form, currentPassword: ev.target.value })} />
          <Input type="password" placeholder="كلمة السر الجديدة (8 أحرف على الأقل)" value={form.newPassword} onChange={(ev) => setForm({ ...form, newPassword: ev.target.value })} />
          <Input type="password" placeholder="تأكيد كلمة السر الجديدة" value={form.confirm} onChange={(ev) => setForm({ ...form, confirm: ev.target.value })} />
          <Button className="w-full" onClick={change} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
        </CardContent>
      </Card>
    </>
  );
}
