'use client';

// الإجازات: طلبات بسير موافقات + أرصدة تلقائية من الحصة السنوية
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, STATUS_AR } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Check, X, Download, Printer } from 'lucide-react';
import { downloadFile } from '@/lib/client';
import { optionLoaders } from '@/components/hrhub/crud-panel';
import { vacationSettlementDoc, printHtml } from '@/components/hrhub/print-docs';

interface LeaveRow extends Record<string, unknown> {
  id: string;
  employee?: { id: string; name: string; code: string; department?: { name: string } | null };
  leaveType?: { id: string; name: string; paid: boolean; quotaDays?: number | null };
  fromDate: string; toDate: string; days: number; status: string; reason?: string | null;
  reviewedBy?: string | null;
}

export function LeavesSection({ canWrite, canApprove }: { canWrite: boolean; canApprove: boolean }) {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [types, setTypes] = useState<{ id: string; name: string; paid: boolean }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await api<{ rows: LeaveRow[]; usage: Record<string, number> }>(`/api/leaves${params}`);
      setRows(data.rows);
      setUsage(data.usage || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ rows: { id: string; name: string; paid: boolean }[] }>('/api/leave-types?limit=100')
      .then((d) => setTypes(d.rows));
  }, []);

  const create = async () => {
    try {
      await api('/api/leaves', { method: 'POST', body: JSON.stringify(form) });
      toast.success('أُنشئ الطلب — بانتظار موافقة HR');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل إنشاء الطلب');
    }
  };

  const act = async (row: LeaveRow, action: 'approve' | 'reject') => {
    try {
      await api(`/api/leaves/${row.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      toast.success(action === 'approve' ? `اعتمدت الإجازة — يومها صار «leave» تلقائيًا في الحضور` : 'رفضت الطلب');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإجراء');
    }
  };

  const daysUsed = (row: LeaveRow) => usage[`${row.employee?.id}:${row.leaveType?.id}`] || 0;

  /** طباعة تسوية الإجازة المقدمة — للإجازات المعتمدة المدفوعة */
  const printVacationSettlement = async (row: LeaveRow) => {
    try {
      const d = await api<Record<string, unknown>>(`/api/leaves/${row.id}/settlement`);
      const emp = d.employee as Record<string, unknown>;
      const bd = d.breakdown as { rows: { month: string; workingDays: number; workingAmount: number; vacationDays: number; vacationAmount: number }[]; workingAmountTotal: number; vacationAmountTotal: number; advanceTotal: number };
      const leave = d.leave as { fromDate: string; toDate: string; days: number; reason: string | null; typeName: string };
      printHtml(vacationSettlementDoc({
        employee: {
          name: String(emp.name), code: String(emp.code),
          department: (emp.department as string | null) || null,
          position: (emp.position as string | null) || null,
          nationality: (emp.nationality as string | null) || null,
          civilId: (emp.civilId as string | null) || null,
          bankAccount: (emp.bankAccount as string | null) || null,
        },
        hireDate: fmtDate(emp.hireDate as string),
        basicSalary: Number(d.basicSalary) || 0,
        totalSalary: Number(d.basicSalary) || 0,
        leave: {
          from: fmtDate(leave.fromDate), to: fmtDate(leave.toDate),
          days: Number(leave.days) || 0, typeName: String(leave.typeName),
        },
        balanceBefore: Number(d.balanceBefore) || 0,
        balanceAfter: Number(d.balanceAfter) || 0,
        annualQuota: Number(d.annualQuota) || 30,
        rows: bd.rows,
        workingAmountTotal: bd.workingAmountTotal,
        vacationAmountTotal: bd.vacationAmountTotal,
        advanceTotal: bd.advanceTotal,
        notes: leave.reason,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل جلب بيانات التسوية');
    }
  };

  const columns: Column<LeaveRow>[] = [
    { key: 'emp', header: 'الموظف', render: (r) => <div><p className="font-medium">{r.employee?.name}</p><p className="text-xs text-muted-foreground">{r.employee?.department?.name}</p></div> },
    { key: 'type', header: 'النوع', render: (r) => (
      <div className="flex items-center gap-2">
        <span>{r.leaveType?.name}</span>
        {!r.leaveType?.paid && <span className="text-xs text-red-600">بدون راتب</span>}
      </div>
    ) },
    { key: 'period', header: 'الفترة', render: (r) => <span className="tabular">{fmtDate(r.fromDate)} → {fmtDate(r.toDate)}</span> },
    { key: 'days', header: 'الأيام', render: (r) => <span className="tabular font-bold">{r.days}</span> },
    { key: 'balance', header: 'الرصيد المستهلك', render: (r) => <span className="tabular text-sm text-muted-foreground">{daysUsed(r)}/{r.leaveType?.quotaDays ?? '∞'}</span>, hideOnMobile: true },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reason', header: 'السبب', render: (r) => r.reason || '—', hideOnMobile: true },
    ...(canApprove ? [{
      key: 'actions', header: 'إجراءات',
      render: (r: LeaveRow) => r.status === 'pending' ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-emerald-700 border-emerald-300" onClick={() => act(r, 'approve')}>
            <Check className="h-3.5 w-3.5" /> اعتماد
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-200" onClick={() => act(r, 'reject')}>
            <X className="h-3.5 w-3.5" /> رفض
          </Button>
        </div>
      ) : (
        <div className="flex gap-1">
          {r.status === 'approved' && r.leaveType?.paid && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => printVacationSettlement(r)}>
              <Printer className="h-3.5 w-3.5" /> تسوية المقدّم
            </Button>
          )}
        </div>
      ),
    } as Column<LeaveRow>] : []),
  ];

  return (
    <div>
      <PageHeader
        title="الإجازات"
        subtitle="سير موافقات — الإجازة المعتمدة تسري فورًا على الحضور اليومي، والرفض يعيد الحساب تلقائيًا"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadFile('/api/export?entity=leaves', 'hrhub-leaves.xlsx')}>
              <Download className="h-4 w-4" /> تصدير
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setForm({ employeeId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '' }); setOpen(true); }}>
                <Plus className="h-4 w-4" /> طلب إجازة
              </Button>
            )}
          </>
        }
      />

      <div className="flex gap-2 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter} dir="rtl">
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">بانتظار الموافقة</SelectItem>
            <SelectItem value="approved">معتمدة</SelectItem>
            <SelectItem value="rejected">مرفوضة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}>تحديث</Button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} emptyText="لا توجد طلبات إجازة" maxBodyHeight="60vh" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>طلب إجازة جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1.5">الموظف</Label>
              <EmployeeSelect value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} />
            </div>
            <div>
              <Label className="mb-1.5">نوع الإجازة</Label>
              <Select value={form.leaveTypeId} onValueChange={(v) => setForm({ ...form, leaveTypeId: v })} dir="rtl">
                <SelectTrigger dir="rtl"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (بدون راتب)'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">من</Label>
                <Input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5">إلى</Label>
                <Input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="mb-1.5">السبب</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create} disabled={!form.employeeId || !form.leaveTypeId || !form.fromDate || !form.toDate}>إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [emps, setEmps] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { optionLoaders.employees().then((o) => setEmps(o.employeeId || [])); }, []);
  return (
    <Select value={value} onValueChange={onChange} dir="rtl">
      <SelectTrigger dir="rtl"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
      <SelectContent>{emps.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
