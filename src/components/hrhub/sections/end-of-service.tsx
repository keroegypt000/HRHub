'use client';

// نهاية الخدمة: حساب مكافأة كل موظف حسب قانون العمل الكويتي رقم 6 لسنة 2010
// عرض تقديري للموظفين النشطين + تسويات فعلية للمنصرفين + تسجيل نهاية خدمة جديدة
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate } from '@/lib/client';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Hourglass, Printer, UserMinus, Calculator, TrendingUp, AlertTriangle } from 'lucide-react';
import { DEPARTURE_REASONS, reasonLabel, INDEMNITY_LAW } from '@/lib/indemnity';
import { useSettlementPreview, SettlementPreviewBox, EosBasisSelect, numOrAuto } from '@/components/hrhub/settlement-preview';
import { indemnityDoc, finalSettlementDoc, printHtml } from '@/components/hrhub/print-docs';
import { cn } from '@/lib/utils';

interface Row {
  id: string; employeeId: string; code: string; name: string; department: string | null;
  status: string; hireDate: string | null; departureDate: string | null;
  departureReason: string | null; deathDate: string | null; lastWage: number;
  years: number; eosAccrued: number; eosIfResigned: number;
  settlement: {
    id: string; reason: string; yearsServed: number; lastWage: number; indemnityFull: number; reasonFactor: number;
    eosAmount: number; leaveAllowance: number; otherDues: number; deductions: number;
    totalDue: number; paidAmount: number; remaining: number; status: string;
  } | null;
}

interface EosData {
  rows: Row[];
  totals: { activeCount: number; accruedTotal: number; remainingDuesTotal: number; noHireDate: number };
  law: string;
}

function Kpi({ title, value, sub, icon: Icon, tone }: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', tone)}>
          <Icon className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-extrabold tabular leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function EndOfServiceSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [data, setData] = useState<EosData | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [departure, setDeparture] = useState<Row | null>(null);

  const load = useCallback(() => {
    api<EosData>('/api/end-of-service').then(setData).catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('hrhub:refresh', onRefresh);
    return () => window.removeEventListener('hrhub:refresh', onRefresh);
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-4">
      <PageHeader
        title="نهاية الخدمة"
        subtitle={`${data.law} — حساب تلقائي لكل موظف (نصف شهر/سنة لأول 5 سنوات + شهر/سنة بعدها)`}
        actions={<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><Calculator className="h-3.5 w-3.5 ml-1" /> تحديث تلقائي</Badge>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi title="موظفون نشطون" value={t.activeCount} icon={Hourglass} tone="bg-emerald-100 text-emerald-700" />
        <Kpi title="مكافآت متراكمة (تقديري)" value={`${fmtKWD(t.accruedTotal)} د.ك`} sub="لو انتهت خدمات الجميع اليوم" icon={TrendingUp} tone="bg-emerald-100 text-emerald-700" />
        <Kpi title="مستحقات متبقية للسداد" value={`${fmtKWD(t.remainingDuesTotal)} د.ك`} sub="للمنصرفين والمتوفين" icon={UserMinus} tone="bg-amber-100 text-amber-700" />
        <Kpi title="بدون تاريخ تعيين" value={t.noHireDate} sub="أدخل تاريخ التعيين لضبط الحساب" icon={AlertTriangle} tone={t.noHireDate ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'} />
      </div>

      <DataTable<Row>
        onRowClick={setDetail}
        columns={[
          { key: 'name', header: 'الموظف', render: (r) => (<div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground tabular">{r.code}{r.department ? ` · ${r.department}` : ''}</p></div>) },
          { key: 'hireDate', header: 'التعيين', render: (r) => <span className="tabular">{r.hireDate ? fmtDate(r.hireDate) : '—'}</span> },
          { key: 'years', header: 'سنوات الخدمة', render: (r) => <span className="tabular font-bold">{r.years ? r.years.toFixed(2) : '—'}</span> },
          { key: 'wage', header: 'آخر أجر', render: (r) => <span className="tabular">{fmtKWD(r.lastWage)}</span>, hideOnMobile: true },
          { key: 'accrued', header: 'المستحق حتى اليوم', render: (r) => <span className="tabular font-bold text-emerald-700">{r.years ? `${fmtKWD(r.eosAccrued)} د.ك` : '—'}</span> },
          { key: 'ifResigned', header: 'لو استقال', render: (r) => <span className="tabular text-muted-foreground">{r.years ? `${fmtKWD(r.eosIfResigned)} د.ك` : '—'}</span>, hideOnMobile: true },
          { key: 'state', header: 'الحالة', render: (r) => r.settlement
            ? <Badge variant="outline" className={r.settlement.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : r.settlement.status === 'partial' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}>
                {reasonLabel(r.settlement.reason)} · متبقٍ {fmtKWD(r.settlement.remaining)}
              </Badge>
            : <StatusBadge status={r.status} /> },
          { key: 'actions', header: '', render: (r) => (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetail(r)}>تفاصيل</Button>
              {canWrite && !r.settlement && r.status === 'active' && (
                <Button size="sm" className="h-8 text-xs" onClick={() => setDeparture(r)}>
                  <UserMinus className="h-3.5 w-3.5" /> نهاية خدمة
                </Button>
              )}
            </div>
          ) },
        ] as Column<Row>[]}
        rows={data.rows}
        loading={false}
      />

      {/* تفاصيل الحساب */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>نهاية الخدمة — {detail?.name} ({detail?.code})</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 py-1 text-sm">
              {!detail.hireDate && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  لا يوجد تاريخ تعيين — عدّل الموظف وأدخل تاريخ التعيين ليُحسب الاستحقاق.
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3">
                {([['تاريخ التعيين', detail.hireDate ? fmtDate(detail.hireDate) : '—'],
                  ['سنوات الخدمة', detail.years ? detail.years.toFixed(2) : '—'],
                  ['آخر أجر شهري', `${fmtKWD(detail.lastWage)} د.ك`],
                  ['المرجع', INDEMNITY_LAW]] as [string, string][]).map(([k, v]) => (
                  <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>

              {detail.settlement ? (
                <>
                  <p className="font-bold text-sm">التسوية الفعلية — {reasonLabel(detail.settlement.reason)}</p>
                  <div className="rounded-lg border divide-y text-sm">
                    {([['المكافأة القانونية كاملة', detail.settlement.indemnityFull],
                      [`المستحق (معامل ${detail.settlement.reasonFactor})`, detail.settlement.eosAmount],
                      ['بدل الإجازات غير المستخدمة', detail.settlement.leaveAllowance],
                      ['مستحقات أخرى', detail.settlement.otherDues],
                      ['استقطاعات', -detail.settlement.deductions]] as [string, number][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between px-3 py-2">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="tabular font-medium">{fmtKWD(v)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 bg-emerald-50 rounded-b-lg">
                      <span className="font-bold">إجمالي المستحقات</span>
                      <span className="tabular font-extrabold text-emerald-700">{fmtKWD(detail.settlement.totalDue)} د.ك</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">المدفوع</span>
                      <span className="tabular">{fmtKWD(detail.settlement.paidAmount)} د.ك</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="font-bold text-red-700">المتبقي للسداد</span>
                      <span className="tabular font-extrabold text-red-700">{fmtKWD(detail.settlement.remaining)} د.ك</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => {
                      printHtml(indemnityDoc({
                        employee: { name: detail.name, code: detail.code, department: detail.department ? { name: detail.department } : null },
                        reasonAr: reasonLabel(detail.settlement!.reason),
                        departureDate: fmtDate(detail.departureDate),
                        hireDate: detail.hireDate ? fmtDate(detail.hireDate) : '—',
                        yearsServed: detail.settlement!.yearsServed, lastWage: detail.settlement!.lastWage,
                        indemnityFull: detail.settlement!.indemnityFull, factor: detail.settlement!.reasonFactor,
                        eosAmount: detail.settlement!.eosAmount, leaveAllowance: detail.settlement!.leaveAllowance,
                        otherDues: detail.settlement!.otherDues, deductions: detail.settlement!.deductions,
                        totalDue: detail.settlement!.totalDue, paidAmount: detail.settlement!.paidAmount,
                        law: INDEMNITY_LAW,
                      }, companyName));
                    }}><Printer className="h-4 w-4" /> طباعة كشف المستحقات</Button>
                    <Button size="sm" onClick={async () => {
                      try {
                        const st = await api<Record<string, unknown>>(`/api/settlements/${detail.settlement!.id}`);
                        const emp = st.employee as Record<string, unknown>;
                        printHtml(finalSettlementDoc({
                          employee: {
                            name: String(emp.name), code: String(emp.code),
                            department: (emp.department as { name?: string } | null)?.name || null,
                            position: (emp.position as { name?: string } | null)?.name || null,
                            nationality: (emp.nationality as string | null) || null,
                            bankAccount: (emp.bankAccount as string | null) || null,
                            manager: (emp.manager as { name?: string } | null)?.name || null,
                          },
                          hireDate: fmtDate(st.hireDate as string),
                          departureDate: fmtDate(st.departureDate as string),
                          reasonAr: reasonLabel(String(st.reason)),
                          basicSalary: Number(st.lastWage) - Number(st.stbHousing) - Number(st.stbSocial) || Number(st.lastWage),
                          stbSalary: Number(st.lastWage),
                          daysPaid: Number(st.daysPaid) || 0,
                          worthSalary: Number(st.worthSalary) || 0,
                          slices: JSON.parse(String(st.slices || '[]')) as { from: string; to: string; slice: number; workingDays: number; stbDays: number; percent: number; amount: number }[],
                          servicePercent: (Number(st.reasonFactor) || 0) * 100,
                          eosAmount: Number(st.eosAmount) || 0,
                          stbBreakdown: {
                            housing: Number(st.stbHousing) || 0, social: Number(st.stbSocial) || 0,
                            provident: Number(st.stbProvident) || 0, insurance: Number(st.stbInsurance) || 0,
                          },
                          vacationDays: Number(st.vacationDays) || 0,
                          vacationAmount: Number(st.leaveAllowance) || 0,
                          loanDeduction: Number(st.loanDeduction) || 0,
                          custodyDeduction: Number(st.custodyDeduction) || 0,
                          otherDues: Number(st.otherDues) || 0,
                          deductions: Number(st.deductions) || 0,
                          totalDue: Number(st.totalDue) || 0,
                          paidAmount: Number(st.paidAmount) || 0,
                        }, companyName));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'فشل جلب بيانات التسوية');
                      }
                    }}><Printer className="h-4 w-4" /> طباعة التسوية الكاملة</Button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                  <p className="font-bold">تقدير حتى اليوم (لم تُسجّل نهاية خدمة)</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">بإنهاء الشركة (كاملة)</span><span className="tabular font-bold text-emerald-700">{fmtKWD(detail.eosAccrued)} د.ك</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">لو استقال اليوم (نسبة المادة 51)</span><span className="tabular">{fmtKWD(detail.eosIfResigned)} د.ك</span></div>
                  <p className="text-[11px] text-muted-foreground">النظام: نصف شهر لكل سنة من أول 5 سنوات + شهر لكل سنة بعدها. الاستقالة: أقل من 3 سنوات لا شيء، 3-5 الثلث، 5-10 النصف، 10+ كاملة.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تسجيل نهاية خدمة */}
      {departure && (
        <DepartureDialog
          row={departure}
          companyName={companyName}
          onClose={() => setDeparture(null)}
          onDone={() => { setDeparture(null); load(); }}
        />
      )}
    </div>
  );
}

/** حوار تسجيل نهاية الخدمة مع معاينة حساب حية */
function DepartureDialog({ row, onClose, onDone, companyName }: {
  row: Row; onClose: () => void; onDone: () => void; companyName: string;
}) {
  const [form, setForm] = useState({
    departureDate: new Date(Date.now() + 180 * 60_000).toISOString().slice(0, 10),
    reason: 'terminated',
    eosBasis: 'default',
    lastWage: '', leaveAllowance: '', otherDues: '0', deductions: '0', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const body = {
    employeeId: row.employeeId,
    departureDate: form.departureDate,
    reason: form.reason,
    eosBasis: form.eosBasis === 'default' ? null : form.eosBasis,
    lastWage: numOrAuto(form.lastWage),
    leaveAllowance: numOrAuto(form.leaveAllowance),
    otherDues: Number(form.otherDues) || 0,
    deductions: Number(form.deductions) || 0,
  };
  const { data: preview, error: previewError } = useSettlementPreview('/api/settlements', 'POST', body);

  const submit = async () => {
    setSaving(true);
    try {
      const saved = await api<{ totalDue: number }>('/api/settlements', {
        method: 'POST',
        body: JSON.stringify({ ...body, notes: form.notes || null }),
      });
      toast.success(`تم تسجيل نهاية الخدمة — الإجمالي ${fmtKWD(saved.totalDue)} د.ك`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسجيل نهاية خدمة — {row.name} ({row.code})</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <Label className="mb-1.5 block">تاريخ نهاية الخدمة *</Label>
            <Input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">السبب *</Label>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTURE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <EosBasisSelect value={form.eosBasis} onChange={(v) => setForm({ ...form, eosBasis: v })} />
          <div>
            <Label className="mb-1.5 block">أجر المكافأة يدويًا (د.ك)</Label>
            <Input type="number" step="any" placeholder="تلقائي حسب الأساس" value={form.lastWage} onChange={(e) => setForm({ ...form, lastWage: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">اتركه فارغًا ليُحسب من آخر عقد حسب الأساس المختار</p>
          </div>
          <div>
            <Label className="mb-1.5 block">تعويض الإجازات (د.ك)</Label>
            <Input type="number" step="any" placeholder="تلقائي من الرصيد" value={form.leaveAllowance} onChange={(e) => setForm({ ...form, leaveAllowance: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">اتركه فارغًا ليُحسب من رصيد الإجازات × قيمة اليوم</p>
          </div>
          <div>
            <Label className="mb-1.5 block">مستحقات أخرى (د.ك)</Label>
            <Input type="number" step="any" value={form.otherDues} onChange={(e) => setForm({ ...form, otherDues: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">استقطاعات (د.ك)</Label>
            <Input type="number" step="any" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">أقساط القروض غير المسددة تُحسب تلقائيًا داخل التسوية</p>
          </div>
          <div className="col-span-2">
            <Label className="mb-1.5 block">ملاحظات</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        {/* معاينة الحساب الحية — من الخادم */}
        <SettlementPreviewBox data={preview} error={previewError} noHireDate={!row.hireDate} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'تسجيل نهاية الخدمة'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
