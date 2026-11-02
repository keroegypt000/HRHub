'use client';

// العقود: إنشاء، تجديد بسلسلة مرتبطة، إنهاء بسبب موثق، طباعة إشعار
import { useState } from 'react';
import { api, fmtKWD, fmtDate } from '@/lib/client';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { RefreshCcw, Ban } from 'lucide-react';
import { contractNoticeDoc, printHtml } from '@/components/hrhub/print-docs';

interface ContractRow extends Record<string, unknown> {
  id: string; contractNo: string; employeeId: string;
  employee?: { id: string; name: string; code: string };
  type: string; startDate: string; endDate?: string | null; basicSalary: number;
  housingAllowance: number; transportAllowance: number; otherAllowance: number;
  hoursPerDay: number; daysPerWeek: number; status: string;
  renewalOf?: { contractNo: string } | null;
}

export function ContractsSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [renewing, setRenewing] = useState<ContractRow | null>(null);
  const [terminating, setTerminating] = useState<ContractRow | null>(null);
  const [renewForm, setRenewForm] = useState({ startDate: '', endDate: '', basicSalary: 0 });
  const [termReason, setTermReason] = useState('');

  const doRenew = async () => {
    if (!renewing) return;
    try {
      await api('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: renewing.employeeId,
          type: renewing.type,
          startDate: renewForm.startDate || renewing.endDate || fmtDate(new Date()),
          endDate: renewForm.endDate || null,
          basicSalary: renewForm.basicSalary || renewing.basicSalary,
          housingAllowance: renewing.housingAllowance,
          transportAllowance: renewing.transportAllowance,
          hoursPerDay: renewing.hoursPerDay,
          notes: `تجديد للعقد ${renewing.contractNo}`,
        }),
      });
      toast.success('تم إنشاء عقد التجديد — مرتبط بسلسلة التجديدات');
      setRenewing(null);
      window.dispatchEvent(new CustomEvent('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التجديد');
    }
  };

  const doTerminate = async () => {
    if (!terminating) return;
    try {
      await api(`/api/contracts/${terminating.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ terminate: true, reason: termReason || 'غير محدد' }),
      });
      toast.success('تم إنهاء العقد بسبب موثق — يُطبع الإشعار الآن');
      printHtml(contractNoticeDoc(
        terminating.employee ? { name: terminating.employee.name, code: terminating.employee.code } : { name: '', code: '' },
        { contractNo: terminating.contractNo, startDate: fmtDate(terminating.startDate), endDate: terminating.endDate ? fmtDate(terminating.endDate) : null, status: 'terminated' },
        null, 'terminate', termReason, companyName
      ));
      setTerminating(null);
      setTermReason('');
      window.dispatchEvent(new CustomEvent('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإنهاء');
    }
  };

  const renderRowActions = (r: ContractRow) =>
    r.status === 'active' ? (
      <>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" title="تجديد"
          onClick={(e) => {
            e.stopPropagation();
            setRenewing(r);
            const base = r.endDate ? r.endDate.slice(0, 10) : fmtDate(new Date());
            setRenewForm({ startDate: base, endDate: '', basicSalary: r.basicSalary });
          }}>
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-700" title="إنهاء"
          onClick={(e) => { e.stopPropagation(); setTerminating(r); }}>
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </>
    ) : undefined;

  return (
    <>
      <CrudPanel<ContractRow>
        entityPath="/api/contracts"
        entityLabel="عقد"
        title="العقود"
        subtitle="عقود العمل بالبدلات — منع تداخل العقود النشطة، والتجديد بسلسلة مرتبطة، وتنبيهات الانتهاء 30/60/90 يومًا في لوحة التحكم"
        canWrite={canWrite}
        searchPlaceholder="بحث برقم العقد..."
        columns={[
          { key: 'contractNo', header: 'رقم العقد', render: (r) => <span className="font-mono font-bold">{r.contractNo}</span> },
          { key: 'employee', header: 'الموظف', render: (r) => r.employee ? `${r.employee.name} (${r.employee.code})` : '—' },
          { key: 'type', header: 'النوع', render: (r) => <StatusBadge status={r.type} /> },
          { key: 'period', header: 'الفترة', render: (r) => <span className="tabular">{fmtDate(r.startDate)} → {r.endDate ? fmtDate(r.endDate) : '∞'}</span> },
          { key: 'salary', header: 'الأساسي (د.ك)', render: (r) => <span className="tabular">{fmtKWD(r.basicSalary)}</span>, hideOnMobile: true },
          { key: 'allow', header: 'البدلات', render: (r) => <span className="tabular">{fmtKWD(r.housingAllowance + r.transportAllowance + r.otherAllowance)}</span>, hideOnMobile: true },
          { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'renew', header: 'تجديد من', render: (r) => r.renewalOf ? <span className="font-mono text-xs">{r.renewalOf.contractNo}</span> : '—', hideOnMobile: true },
        ]}
        fields={[
          { key: 'employeeId', label: 'الموظف', type: 'select', required: true },
          { key: 'type', label: 'نوع العقد', type: 'select', options: [
            { value: 'full_time', label: 'دوام كامل' }, { value: 'part_time', label: 'دوام جزئي' },
            { value: 'temporary', label: 'مؤقت' }, { value: 'consultant', label: 'مستشار' },
          ] },
          { key: 'startDate', label: 'تاريخ البداية', type: 'date', required: true },
          { key: 'endDate', label: 'تاريخ النهاية (اختياري)', type: 'date' },
          { key: 'durationMonths', label: 'المدة (أشهر)', type: 'number' },
          { key: 'basicSalary', label: 'الراتب الأساسي (د.ك)', type: 'number', required: true },
          { key: 'housingAllowance', label: 'بدل سكن (د.ك)', type: 'number' },
          { key: 'transportAllowance', label: 'بدل مواصلات (د.ك)', type: 'number' },
          { key: 'otherAllowance', label: 'بدل أخرى (د.ك)', type: 'number' },
          { key: 'hoursPerDay', label: 'ساعات اليوم', type: 'number' },
          { key: 'daysPerWeek', label: 'أيام الأسبوع', type: 'number' },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{ type: 'full_time', hoursPerDay: 8, daysPerWeek: 5, basicSalary: 0 }}
        loadOptions={optionLoaders.employees}
        rowToForm={(r) => ({ ...r, startDate: fmtDate(r.startDate), endDate: r.endDate ? fmtDate(r.endDate) : '' })}
        rowActions={canWrite ? renderRowActions : undefined}
      />

      {/* حوار التجديد */}
      <Dialog open={!!renewing} onOpenChange={(o) => !o && setRenewing(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>تجديد العقد {renewing?.contractNo}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              سينشأ عقد جديد مرتبط بسلسلة التجديدات. تاريخ البداية المقترح = تاريخ انتهاء سابقه.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">بداية العقد الجديد</Label>
                <Input type="date" value={renewForm.startDate} onChange={(e) => setRenewForm({ ...renewForm, startDate: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5 block">نهايته</Label>
                <Input type="date" value={renewForm.endDate} onChange={(e) => setRenewForm({ ...renewForm, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">الراتب الأساسي الجديد (د.ك)</Label>
              <Input type="number" step="0.001" value={renewForm.basicSalary} onChange={(e) => setRenewForm({ ...renewForm, basicSalary: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewing(null)}>إلغاء</Button>
            <Button onClick={doRenew}><RefreshCcw className="h-4 w-4" /> تجديد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار الإنهاء */}
      <Dialog open={!!terminating} onOpenChange={(o) => !o && setTerminating(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إنهاء العقد {terminating?.contractNo}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1.5 block">سبب الإنهاء (موثق)</Label>
              <Textarea value={termReason} onChange={(e) => setTermReason(e.target.value)} rows={3} placeholder="مثال: استقالة الموظف / نهاية المشروع..." />
            </div>
            <p className="text-xs text-muted-foreground">سيُطبع إشعار إنهاء العقد بعد الحفظ.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminating(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={doTerminate}><Ban className="h-4 w-4" /> إنهاء وطباعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
