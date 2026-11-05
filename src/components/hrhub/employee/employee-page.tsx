'use client';

// صفحة الموظف الشاملة — كل ما يخص الموظف في مكان واحد بدل التنقل بين الأقسام:
// بطاقات ملخص (الراتب، الإجازة، حضور الشهر، السلف، المستندات، نهاية الخدمة) ثم التفاصيل في تبويبات
import { useCallback, useEffect, useState } from 'react';
import { api, fmtKWD, fmtDate, fmtTime, fmtMinutes } from '@/lib/client';
import { StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Camera, Award, FileBadge, Printer, Wallet, Palmtree, CalendarCheck2, HandCoins, FileWarning, Hourglass, Upload } from 'lucide-react';
import { salaryCertificateDoc, introLetterDoc, payslipDoc, printHtml, PayslipDocData } from '@/components/hrhub/print-docs';
import { requestTypeLabel, REQUEST_STATUS_AR } from '@/lib/requests';
import { reasonLabel } from '@/lib/indemnity';

interface Overview {
  employee: {
    id: string; code: string; name: string; status: string; photoId?: string | null; pin?: string | null;
    gender?: string | null; nationality?: string | null; civilId?: string | null; passportNo?: string | null;
    phone?: string | null; email?: string | null; address?: string | null; birthDate?: string | null;
    maritalStatus?: string | null; bankAccount?: string | null; hireDate?: string | null; basicSalary: number;
    notes?: string | null; weeklyOffText: string; eosBasis: string;
    department?: { name: string } | null; position?: { name: string } | null;
    manager?: { name: string; code: string } | null;
    contracts: { id: string; contractNo: string; type: string; startDate: string; endDate?: string | null; basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number; status: string }[];
    leaveRequests: { id: string; leaveType: { name: string }; fromDate: string; toDate: string; days: number; status: string }[];
    payslips: { id: string; period: { name: string; status: string }; netPay: number; absenceDays: number; workedDays: number; status: string }[];
    files: { id: string; fileName: string; size: number; ownerTag?: string | null }[];
    passports: { id: string; passportNo: string; expiryDate: string }[];
    iqamas: { id: string; iqamaNo: string; expiryDate: string; sponsor?: string | null }[];
    loans: { id: string; name: string; totalAmount: number; paidAmount: number; installmentsCount: number; paidInstallments: number; monthlyDeduction: number; status: string }[];
    requests: { id: string; type: string; status: string; createdAt: string }[];
    settlements: { id: string; reason: string; departureDate: string; totalDue: number; paidAmount: number; status: string }[];
    userAccount?: { username: string; active: boolean } | null;
    custodies: { id: string; itemName: string; category: string; serialNo?: string | null; quantity: number; value: number; issuedAt: string; returnedAt?: string | null; status: string }[];
  };
  contract: { contractNo: string; endDate?: string | null } | null;
  wage: { basic: number; housing: number; transport: number; other: number; total: number };
  attendance: { date: string; firstIn: string | null; lastOut: string | null; workedMinutes: number; lateMinutes: number; earlyMinutes: number; otMinutes: number; status: string; note: string | null }[];
  attendanceSummary: { month: string; present: number; late: number; absent: number; missedPunch: number; leave: number; lateMinutes: number; otMinutes: number; workedMinutes: number };
  annual: { accrued: number; used: number; balance: number; annualQuota: number };
  eos: { years: number; basis: string; wage: number; full: number; ifResigned: number; ifTerminated: number };
  documents: { kind: string; no: string; expiry: string; daysLeft: number }[];
  loansOutstanding: number;
  pendingRequests: number;
  custodyOpenValue: number;
  currentShift: string | null;
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center', tone)}><Icon className="h-4 w-4" /></span>
        {label}
      </div>
      <p className="mt-1.5 text-lg font-extrabold tabular">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || '—'}</p>
    </div>
  );
}

const expiryTone = (days: number) => (days < 0 ? 'bg-red-100 text-red-800' : days <= 60 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');
const expiryText = (days: number) => (days < 0 ? `منتهي منذ ${-days} يوم` : `باقي ${days} يوم`);

export function EmployeePage({ id, open, onClose, canWrite, companyName, accountPanel }: {
  id: string; open: boolean; onClose: () => void; canWrite: boolean; companyName: string;
  accountPanel?: React.ReactNode;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [month, setMonth] = useState(() => new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 7));
  const [certOpen, setCertOpen] = useState(false);
  const [certTo, setCertTo] = useState('');
  const [letterOpen, setLetterOpen] = useState(false);
  const [letterPurpose, setLetterPurpose] = useState('');

  const load = useCallback(() => {
    api<Overview>(`/api/employees/${id}/overview?month=${month}`).then(setData).catch((e) => toast.error(e.message));
  }, [id, month]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const upload = async (file: File, path: string, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const token = localStorage.getItem('sid');
    const res = await fetch(path, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    if (res.ok) { toast.success('تم الرفع'); load(); } else toast.error((await res.json().catch(() => ({}))).error || 'فشل الرفع');
  };

  const printSlip = async (slipId: string) => {
    try { printHtml(payslipDoc(await api<PayslipDocData>(`/api/payslips/${slipId}`), companyName)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الفتح'); }
  };

  const e = data?.employee;
  const s = data?.attendanceSummary;
  const nearest = data?.documents[0];
  const files = e?.files.filter((f) => f.ownerTag !== 'employee_photo') || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto overflow-x-hidden" dir="rtl">
        {!data || !e ? <p className="py-16 text-center text-muted-foreground">جارٍ التحميل...</p> : (
          <div className="space-y-4 min-w-0">
            {/* الرأس */}
            <DialogHeader>
              <DialogTitle asChild>
                <div className="flex flex-wrap items-center gap-4">
                  <label className={cn('relative h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-black overflow-hidden shrink-0', canWrite && 'cursor-pointer')}>
                    {e.photoId ? <img src={`/api/files/${e.photoId}`} alt={e.name} className="h-full w-full object-cover" /> : e.name.slice(0, 2)}
                    {canWrite && <>
                      <span className="absolute bottom-0 inset-x-0 bg-black/40 text-white flex justify-center py-0.5"><Camera className="h-3 w-3" /></span>
                      <input type="file" accept="image/*" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(f, `/api/employees/${id}/photo`); }} />
                    </>}
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-extrabold">{e.name} <span className="text-sm text-muted-foreground font-normal tabular">#{e.code}</span></p>
                    <p className="text-sm text-muted-foreground">
                      {e.position?.name || '—'} · {e.department?.name || '—'}
                      {e.manager && <> · المدير: {e.manager.name}</>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <StatusBadge status={e.status} />
                      {data.currentShift && <Badge variant="outline">{data.currentShift}</Badge>}
                      <Badge variant="outline">الراحة: {e.weeklyOffText}</Badge>
                      {e.userAccount && <Badge variant="outline">بوابة: {e.userAccount.username}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCertOpen(true)}><Award className="h-4 w-4" /> شهادة راتب</Button>
                    <Button size="sm" variant="outline" onClick={() => setLetterOpen(true)}><FileBadge className="h-4 w-4" /> خطاب تعريف</Button>
                  </div>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* بطاقات الملخص */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi icon={Wallet} tone="bg-emerald-100 text-emerald-700" label="الراتب الشهري" value={`${fmtKWD(data.wage.total)} د.ك`}
                sub={`أساسي ${fmtKWD(data.wage.basic)}${data.wage.housing ? ` + سكن ${fmtKWD(data.wage.housing)}` : ''}${data.wage.transport ? ` + مواصلات ${fmtKWD(data.wage.transport)}` : ''}`} />
              <Kpi icon={Palmtree} tone="bg-sky-100 text-sky-700" label="رصيد الإجازة السنوية" value={`${data.annual.balance.toFixed(1)} يوم`}
                sub={`مستحق ${data.annual.accrued.toFixed(1)} · مستخدم ${data.annual.used}`} />
              <Kpi icon={CalendarCheck2} tone={s!.absent ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} label={`حضور ${s!.month}`}
                value={<span>{s!.present} <span className="text-xs font-normal">حاضر</span> · <span className={s!.absent ? 'text-red-700' : ''}>{s!.absent}</span> <span className="text-xs font-normal">غائب</span></span>}
                sub={`تأخير ${s!.lateMinutes} د · إضافي ${fmtMinutes(s!.otMinutes)}${s!.missedPunch ? ` · بصمة ناقصة ${s!.missedPunch}` : ''}`} />
              <Kpi icon={HandCoins} tone="bg-amber-100 text-amber-700" label="السلف المتبقية" value={`${fmtKWD(data.loansOutstanding)} د.ك`}
                sub={`${e.loans.filter((l) => l.status === 'active').length} سلفة نشطة · ${data.pendingRequests} طلب معلق`} />
              <Kpi icon={FileWarning} tone={nearest && nearest.daysLeft <= 60 ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-700'} label="أقرب مستند ينتهي"
                value={nearest ? `${nearest.kind}` : '—'} sub={nearest ? `${fmtDate(nearest.expiry)} · ${expiryText(nearest.daysLeft)}` : 'لا توجد مستندات'} />
              <Kpi icon={Hourglass} tone="bg-violet-100 text-violet-700" label="نهاية الخدمة حتى اليوم" value={`${fmtKWD(data.eos.full)} د.ك`}
                sub={`${data.eos.years} سنة · لو استقال ${fmtKWD(data.eos.ifResigned)}`} />
            </div>

            <Tabs defaultValue="info" dir="rtl">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="info">البيانات والعقد</TabsTrigger>
                <TabsTrigger value="attendance">الحضور</TabsTrigger>
                <TabsTrigger value="leaves">الإجازات ({e.leaveRequests.length})</TabsTrigger>
                <TabsTrigger value="payroll">الرواتب ({e.payslips.length})</TabsTrigger>
                <TabsTrigger value="requests">الطلبات والسلف</TabsTrigger>
                <TabsTrigger value="custody">العُهد ({e.custodies.filter((c) => c.status === 'issued').length})</TabsTrigger>
                <TabsTrigger value="docs">المستندات والملفات</TabsTrigger>
                <TabsTrigger value="eos">نهاية الخدمة</TabsTrigger>
                {canWrite && accountPanel && <TabsTrigger value="ess">بوابة الموظف</TabsTrigger>}
              </TabsList>

              <TabsContent value="info" className="pt-3 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 rounded-xl border p-4">
                  <Field label="الرقم الوظيفي" value={e.code} /><Field label="PIN البصمة" value={e.pin || e.code} />
                  <Field label="الجنس" value={e.gender} /><Field label="الجنسية" value={e.nationality} />
                  <Field label="الرقم المدني" value={e.civilId} /><Field label="رقم الجواز" value={e.passportNo} />
                  <Field label="تاريخ الميلاد" value={e.birthDate ? fmtDate(e.birthDate) : null} /><Field label="الحالة الاجتماعية" value={e.maritalStatus} />
                  <Field label="الهاتف" value={e.phone} /><Field label="البريد" value={e.email} />
                  <Field label="العنوان" value={e.address} /><Field label="الحساب البنكي" value={e.bankAccount} />
                  <Field label="تاريخ التعيين" value={e.hireDate ? `${fmtDate(e.hireDate)} (${data.eos.years} سنة)` : null} />
                  <Field label="يوم الراحة" value={e.weeklyOffText} />
                  <Field label="الوردية" value={data.currentShift} />
                  <Field label="أساس المكافأة" value={e.eosBasis === 'full_wage' ? 'الأساسي + البدلات' : 'الأساسي فقط'} />
                </div>
                {e.notes && <p className="text-sm text-muted-foreground">ملاحظات: {e.notes}</p>}
                <div className="space-y-2">
                  <p className="font-bold text-sm">العقود</p>
                  {e.contracts.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عقود — الراتب من ملف الموظف</p>}
                  {e.contracts.map((c) => (
                    <div key={c.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono font-bold">{c.contractNo}</span><StatusBadge status={c.status} />
                      <span className="tabular text-muted-foreground">{fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : 'مفتوح'}</span>
                      <span className="tabular">أساسي {fmtKWD(c.basicSalary)} · سكن {fmtKWD(c.housingAllowance)} · مواصلات {fmtKWD(c.transportAllowance)}{c.otherAllowance ? ` · أخرى ${fmtKWD(c.otherAllowance)}` : ''}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="attendance" className="pt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} className="w-44" />
                  <span className="text-sm text-muted-foreground">
                    حاضر {s!.present} · متأخر {s!.late} · غائب {s!.absent} · إجازة {s!.leave} · بصمة ناقصة {s!.missedPunch} · ساعات العمل {fmtMinutes(s!.workedMinutes)}
                  </span>
                </div>
                <div className="rounded-xl border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-right text-xs text-muted-foreground border-b bg-muted/40">
                      <th className="p-2">التاريخ</th><th>الحالة</th><th>دخول</th><th>خروج</th><th>العمل</th><th>تأخير</th><th>خروج مبكر/عجز</th><th>إضافي</th>
                    </tr></thead>
                    <tbody>
                      {data.attendance.map((d) => (
                        <tr key={d.date} className={cn('border-b last:border-0', d.status === 'absent' && 'bg-red-50', d.status === 'missed_punch' && 'bg-amber-50')}>
                          <td className="p-2 tabular">{fmtDate(d.date)}</td>
                          <td><StatusBadge status={d.status} /></td>
                          <td className="tabular">{fmtTime(d.firstIn)}</td><td className="tabular">{fmtTime(d.lastOut)}</td>
                          <td className="tabular">{d.workedMinutes ? fmtMinutes(d.workedMinutes) : '—'}</td>
                          <td className="tabular">{d.lateMinutes ? `${d.lateMinutes} د` : '—'}</td>
                          <td className="tabular">{d.earlyMinutes ? `${d.earlyMinutes} د` : '—'}</td>
                          <td className="tabular">{d.otMinutes ? fmtMinutes(d.otMinutes) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.attendance.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد حضور محسوب لهذا الشهر</p>}
                </div>
              </TabsContent>

              <TabsContent value="leaves" className="pt-3 space-y-2">
                <p className="text-sm">رصيد السنوية: <b>{data.annual.balance.toFixed(3)}</b> يوم (الحصة {data.annual.annualQuota} يوم/سنة · المستحق حتى اليوم {data.annual.accrued.toFixed(3)} · المستخدم {data.annual.used})</p>
                {e.leaveRequests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد إجازات</p>}
                {e.leaveRequests.map((l) => (
                  <div key={l.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{l.leaveType.name}</span>
                    <span className="tabular text-muted-foreground">{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} ({l.days} يوم)</span>
                    <StatusBadge status={l.status} />
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="payroll" className="pt-3 space-y-2">
                {e.payslips.length === 0 && <p className="text-sm text-muted-foreground">لا توجد قسائم</p>}
                {e.payslips.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-bold tabular w-20">{p.period.name}</span>
                    <span className="tabular">الصافي <b className="text-emerald-700">{fmtKWD(p.netPay)} د.ك</b></span>
                    <span className="text-muted-foreground">عمل {p.workedDays} · غياب {p.absenceDays}</span>
                    <StatusBadge status={p.period.status} />
                    <Button size="sm" variant="ghost" className="ms-auto" onClick={() => printSlip(p.id)}><Printer className="h-4 w-4" /> القسيمة</Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="requests" className="pt-3 grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="font-bold text-sm">الطلبات</p>
                  {e.requests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات</p>}
                  {e.requests.map((r) => (
                    <div key={r.id} className="rounded-lg border p-2.5 flex items-center justify-between gap-2 text-sm">
                      <span>{requestTypeLabel(r.type)}</span>
                      <span className="text-xs text-muted-foreground tabular">{fmtDate(r.createdAt)}</span>
                      <Badge variant="outline">{REQUEST_STATUS_AR[r.status] || r.status}</Badge>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-sm">السلف</p>
                  {e.loans.length === 0 && <p className="text-sm text-muted-foreground">لا توجد سلف</p>}
                  {e.loans.map((l) => (
                    <div key={l.id} className="rounded-lg border p-2.5 text-sm space-y-1">
                      <div className="flex justify-between"><span className="font-medium">{l.name}</span><StatusBadge status={l.status} /></div>
                      <p className="text-xs text-muted-foreground tabular">
                        {fmtKWD(l.totalAmount)} د.ك · قسط {fmtKWD(l.monthlyDeduction)} · مدفوع {l.paidInstallments}/{l.installmentsCount} · متبقٍ {fmtKWD(l.totalAmount - l.paidAmount)}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="custody" className="pt-3 space-y-2">
                <p className="text-sm">قيمة العهد غير المُستلمة: <b className={data.custodyOpenValue ? 'text-red-700' : ''}>{fmtKWD(data.custodyOpenValue)} د.ك</b> — تُخصم في تسوية نهاية الخدمة إن لم تُسلَّم. الإضافة والاستلام من قسم «العُهد».</p>
                {e.custodies.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عهد</p>}
                {e.custodies.map((c) => (
                  <div key={c.id} className="rounded-lg border p-2.5 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{c.itemName}{c.quantity > 1 ? ` ×${c.quantity}` : ''}</span>
                    {c.serialNo && <span className="font-mono text-xs">{c.serialNo}</span>}
                    <span className="tabular text-muted-foreground">سُلمت {fmtDate(c.issuedAt)}{c.returnedAt ? ` · استُلمت ${fmtDate(c.returnedAt)}` : ''}</span>
                    <span className="tabular">{fmtKWD(c.value)} د.ك</span>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="docs" className="pt-3 space-y-3">
                <div className="space-y-2">
                  {data.documents.length === 0 && <p className="text-sm text-muted-foreground">لا توجد جوازات أو إقامات مسجلة</p>}
                  {data.documents.map((d, i) => (
                    <div key={i} className="rounded-lg border p-2.5 flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-medium w-14">{d.kind}</span>
                      <span className="font-mono">{d.no}</span>
                      <span className="tabular text-muted-foreground">ينتهي {fmtDate(d.expiry)}</span>
                      <Badge className={expiryTone(d.daysLeft)}>{expiryText(d.daysLeft)}</Badge>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-sm">الملفات</p>
                    {canWrite && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-emerald-50">
                        <Upload className="h-3.5 w-3.5" /> رفع ملف
                        <input type="file" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(f, '/api/files/upload', { employeeId: id, ownerTag: 'employee_document' }); }} />
                      </label>
                    )}
                  </div>
                  {files.length === 0 && <p className="text-sm text-muted-foreground">لا توجد ملفات</p>}
                  {files.map((f) => (
                    <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-lg border p-2.5 flex items-center justify-between text-sm hover:bg-muted/40">
                      <span className="truncate">{f.fileName}</span><span className="text-xs text-muted-foreground tabular">{Math.round(f.size / 1024)} KB</span>
                    </a>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="eos" className="pt-3 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Kpi icon={Hourglass} tone="bg-violet-100 text-violet-700" label="المكافأة كاملة حتى اليوم" value={`${fmtKWD(data.eos.full)} د.ك`} sub={`أجر المكافأة ${fmtKWD(data.eos.wage)} (${data.eos.basis === 'full_wage' ? 'أساسي + بدلات' : 'أساسي فقط'})`} />
                  <Kpi icon={Hourglass} tone="bg-violet-100 text-violet-700" label="لو استقال اليوم" value={`${fmtKWD(data.eos.ifResigned)} د.ك`} sub="حسب نسب الاستقالة (المادة 51)" />
                  <Kpi icon={Hourglass} tone="bg-violet-100 text-violet-700" label="لو أُنهيت خدمته" value={`${fmtKWD(data.eos.ifTerminated)} د.ك`} sub="بدون راتب آخر شهر وتعويض الإجازات" />
                </div>
                {e.settlements.map((st) => (
                  <div key={st.id} className="rounded-lg border p-3 text-sm flex flex-wrap gap-3">
                    <b>تسوية مسجلة:</b> {reasonLabel(st.reason)} · {fmtDate(st.departureDate)} · الإجمالي {fmtKWD(st.totalDue)} · المدفوع {fmtKWD(st.paidAmount)}
                    <StatusBadge status={st.status} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">لتسجيل نهاية الخدمة وطباعة التسوية الكاملة: قسم «نهاية الخدمة».</p>
              </TabsContent>

              {canWrite && accountPanel && <TabsContent value="ess" className="pt-3">{accountPanel}</TabsContent>}
            </Tabs>
          </div>
        )}

        {/* شهادة راتب */}
        <Dialog open={certOpen} onOpenChange={setCertOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader><DialogTitle>شهادة راتب — {e?.name}</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>موجهة إلى (اتركه فارغًا لـ «من يعنيه الأمر»)</Label>
              <Input value={certTo} onChange={(ev) => setCertTo(ev.target.value)} placeholder="مثال: بنك الكويت الوطني" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCertOpen(false)}>إلغاء</Button>
              <Button onClick={() => {
                if (!e) return;
                const slips = e.payslips.filter((p) => p.period.status === 'paid' || p.period.status === 'approved').slice(0, 3);
                printHtml(salaryCertificateDoc(e, certTo, slips.map((p) => ({ period: { name: p.period.name }, netPay: p.netPay })), companyName));
                setCertOpen(false); setCertTo('');
              }}><Award className="h-4 w-4" /> طباعة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* خطاب تعريف */}
        <Dialog open={letterOpen} onOpenChange={setLetterOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader><DialogTitle>خطاب تعريف — {e?.name}</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>الغرض من الخطاب</Label>
              <Input value={letterPurpose} onChange={(ev) => setLetterPurpose(ev.target.value)} placeholder="مثال: استخراج تأشيرة" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLetterOpen(false)}>إلغاء</Button>
              <Button onClick={() => { if (e) printHtml(introLetterDoc(e, letterPurpose, companyName)); setLetterOpen(false); setLetterPurpose(''); }}>
                <FileBadge className="h-4 w-4" /> طباعة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

