'use client';

// الموظفون: جدول بالصور + ملف كامل بتبويبات (بيانات، عقود، حضور، إجازات، رواتب، ملفات)
import { useCallback, useEffect, useState } from 'react';
import { api, fmtKWD, fmtDate, fmtMinutes, STATUS_AR } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Camera, Eye, UserRound, Award, FileBadge } from 'lucide-react';
import { salaryCertificateDoc, introLetterDoc, printHtml } from '@/components/hrhub/print-docs';
import { WEEKLY_OFF_OPTIONS } from '@/lib/workweek';
import { EOS_BASIS_OPTIONS } from '@/lib/indemnity';

interface EmployeeRow extends Record<string, unknown> {
  id: string; code: string; name: string; photoId?: string | null;
  department?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
  status: string; basicSalary: number; phone?: string | null; pin?: string | null;
  weeklyOffDays?: string | null; eosBasis?: string | null;
  nationality?: string | null; civilId?: string | null; hireDate?: string | null; birthDate?: string | null;
  photo?: { id: string } | null;
  _count?: { contracts: number; leaveRequests: number };
}

interface EmployeeFull extends EmployeeRow {
  gender?: string | null; passportNo?: string | null; email?: string | null; address?: string | null;
  birthDate?: string | null; maritalStatus?: string | null; bankAccount?: string | null; notes?: string | null;
  contracts: { id: string; contractNo: string; type: string; startDate: string; endDate?: string | null; basicSalary: number; housingAllowance: number; transportAllowance: number; status: string }[];
  shiftAssignments: { id: string; shift: { name: string } | null; fromDate: string; toDate?: string | null }[];
  leaveRequests: { id: string; leaveType: { name: string }; fromDate: string; toDate: string; days: number; status: string }[];
  payslips: { id: string; period: { name: string }; netPay: number; status: string }[];
  dailyAttendance: { id: string; date: string; status: string; lateMinutes: number; otMinutes: number; workedMinutes: number }[];
  files: { id: string; fileName: string; mimeType: string; size: number; createdAt: string; ownerTag?: string | null }[];
}

function Avatar({ emp, size = 'h-10 w-10' }: { emp: { photoId?: string | null; photo?: { id: string } | null; name: string }; size?: string }) {
  const photoId = emp.photoId || emp.photo?.id;
  return (
    <div className={`${size} rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold overflow-hidden shrink-0`}>
      {photoId ? (
         
        <img src={`/api/files/${photoId}`} alt={emp.name} className="h-full w-full object-cover" />
      ) : emp.name.slice(0, 2)}
    </div>
  );
}

function EmployeeProfile({ id, open, onClose, canWrite, companyName }: { id: string; open: boolean; onClose: () => void; canWrite: boolean; companyName: string }) {
  const [emp, setEmp] = useState<EmployeeFull | null>(null);
  const [uploading, setUploading] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [certTo, setCertTo] = useState('');
  const [letterOpen, setLetterOpen] = useState(false);
  const [letterPurpose, setLetterPurpose] = useState('');

  const load = useCallback(() => {
    api<EmployeeFull>(`/api/employees/${id}`).then(setEmp).catch((e) => toast.error(e.message));
  }, [id]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('sid');
      const res = await fetch(`/api/employees/${id}/photo`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      if (!res.ok) throw new Error((await res.json()).error || 'فشل الرفع');
      toast.success('تم رفع الصورة');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {emp && <Avatar emp={emp} size="h-11 w-11" />}
            <span>{emp?.name || '...'} <span className="text-sm text-muted-foreground font-normal">({emp?.code})</span></span>
          </DialogTitle>
        </DialogHeader>
        {!emp ? <p className="py-10 text-center text-muted-foreground">جارٍ التحميل...</p> : (
          <Tabs defaultValue="info" dir="rtl">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="info">البيانات</TabsTrigger>
              <TabsTrigger value="contracts">العقود ({emp.contracts.length})</TabsTrigger>
              <TabsTrigger value="attendance">الحضور</TabsTrigger>
              <TabsTrigger value="leaves">الإجازات ({emp.leaveRequests.length})</TabsTrigger>
              <TabsTrigger value="payslips">الرواتب ({emp.payslips.length})</TabsTrigger>
              <TabsTrigger value="files">الملفات ({emp.files.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="pt-3">
              <div className="flex items-start gap-5">
                <div className="text-center shrink-0">
                  <Avatar emp={emp} size="h-28 w-28 text-3xl" />
                  {canWrite && (
                    <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 cursor-pointer hover:underline">
                      <Camera className="h-3.5 w-3.5" />
                      {uploading ? 'جارٍ الرفع...' : 'تغيير الصورة'}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm flex-1">
                  {([
                    ['الرقم الوظيفي', emp.code], ['PIN البصمة', emp.pin || emp.code],
                    ['القسم', emp.department?.name || '—'], ['المسمى', emp.position?.name || '—'],
                    ['الجنس', emp.gender || '—'], ['الجنسية', emp.nationality || '—'],
                    ['الرقم المدني', emp.civilId || '—'], ['الجواز', emp.passportNo || '—'],
                    ['الهاتف', emp.phone || '—'], ['البريد', emp.email || '—'],
                    ['تاريخ التعيين', fmtDate(emp.hireDate)], ['الراتب الأساسي', `${fmtKWD(emp.basicSalary)} د.ك`],
                    ['الحساب البنكي', emp.bankAccount || '—'], ['الحالة', <StatusBadge key="s" status={emp.status} />],
                  ] as [string, React.ReactNode][]).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contracts" className="pt-3">
              <div className="space-y-2">
                {emp.contracts.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عقود</p>}
                {emp.contracts.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono font-bold">{c.contractNo}</span>
                    <StatusBadge status={c.type} />
                    <StatusBadge status={c.status} />
                    <span className="tabular text-muted-foreground">{fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : 'بدون نهاية'}</span>
                    <span className="tabular">أساسي {fmtKWD(c.basicSalary)} · سكن {fmtKWD(c.housingAllowance)} · مواصلات {fmtKWD(c.transportAllowance)}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="pt-3 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-xs text-muted-foreground border-b"><th className="py-2">التاريخ</th><th>الحالة</th><th>دقائق العمل</th><th>تأخير</th><th>إضافي</th></tr></thead>
                <tbody>
                  {emp.dailyAttendance.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 tabular">{fmtDate(d.date)}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td className="tabular">{fmtMinutes(d.workedMinutes)}</td>
                      <td className="tabular">{d.lateMinutes ? `${d.lateMinutes}د` : '—'}</td>
                      <td className="tabular">{d.otMinutes ? `${d.otMinutes}د` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {emp.dailyAttendance.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد حضور محسوب بعد</p>}
            </TabsContent>

            <TabsContent value="leaves" className="pt-3 space-y-2">
              {emp.leaveRequests.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات</p>}
              {emp.leaveRequests.map((l) => (
                <div key={l.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{l.leaveType.name}</span>
                  <span className="tabular text-muted-foreground">{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} ({l.days} يوم)</span>
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="payslips" className="pt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300"
                  disabled={!emp.payslips.length}
                  onClick={() => setCertOpen(true)}>
                  <Award className="h-4 w-4" /> شهادة راتب (آخر فترات)
                </Button>
              </div>
              {!emp.payslips.length && <p className="text-sm text-muted-foreground">لا توجد قسائم</p>}
              {emp.payslips.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-bold tabular">{p.period.name}</span>
                  <span className="tabular">الصافي <b className="text-emerald-700">{fmtKWD(p.netPay)} د.ك</b></span>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="files" className="pt-3">
              <div className="space-y-2">
                {canWrite && (
                  <label className="inline-flex items-center gap-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-emerald-50">
                    <Camera className="h-4 w-4" /> رفع ملف (عقد/مستند)
                    <input type="file" className="hidden" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const form = new FormData();
                      form.append('file', f);
                      form.append('employeeId', id);
                      form.append('ownerTag', 'contract_file');
                      const token = localStorage.getItem('sid');
                      const res = await fetch('/api/files/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
                      if (res.ok) { toast.success('تم رفع الملف'); load(); } else toast.error('فشل الرفع');
                    }} />
                  </label>
                )}
                {emp.files.filter((f) => f.ownerTag !== 'employee_photo').length === 0 && <p className="text-sm text-muted-foreground">لا توجد ملفات</p>}
                {emp.files.filter((f) => f.ownerTag !== 'employee_photo').map((f) => (
                  <div key={f.id} className="rounded-lg border p-3 flex items-center gap-3 text-sm">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline flex-1 truncate">{f.fileName}</a>
                    <span className="text-xs text-muted-foreground tabular">{Math.round(f.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* شهادة راتب */}
        <Dialog open={certOpen} onOpenChange={setCertOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader><DialogTitle>شهادة راتب — {emp?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <Label className="mb-1.5">موجهة إلى (بنك / جهة — اتركه فارغًا لـ «من يعنيه»)</Label>
              <Input value={certTo} onChange={(e) => setCertTo(e.target.value)} placeholder="مثال: بنك الكويت الوطني" />
              <p className="text-xs text-muted-foreground">تتضمن تفاصيل الراتب الأساسي وصافي آخر {Math.min(3, emp?.payslips.length || 0)} فترات مع التفقيط العربي.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCertOpen(false)}>إلغاء</Button>
              <Button onClick={() => {
                if (!emp) return;
                const slips = [...emp.payslips].filter((p) => p.status === 'paid' || p.status === 'approved').slice(0, 3);
                printHtml(salaryCertificateDoc(emp, certTo, slips.map((p) => ({ period: { name: p.period.name }, netPay: p.netPay })), companyName));
                setCertOpen(false); setCertTo('');
              }}>
                <Award className="h-4 w-4" /> طباعة الشهادة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* خطاب تعريف */}
        <Dialog open={letterOpen} onOpenChange={setLetterOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader><DialogTitle>خطاب تعريف موظف — {emp?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <Label className="mb-1.5">الغرض من الخطاب</Label>
              <Input value={letterPurpose} onChange={(e) => setLetterPurpose(e.target.value)} placeholder="مثال: استخراج تأشيرة زيارة عائلية" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLetterOpen(false)}>إلغاء</Button>
              <Button onClick={() => {
                if (!emp) return;
                printHtml(introLetterDoc(emp, letterPurpose, companyName));
                setLetterOpen(false); setLetterPurpose('');
              }}>
                <FileBadge className="h-4 w-4" /> طباعة الخطاب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeesSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [profileId, setProfileId] = useState<string | null>(null);

  const columns: Column<EmployeeRow>[] = [
    {
      key: 'name', header: 'الموظف',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar emp={r} />
          <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground tabular">{r.code}</p></div>
        </div>
      ),
    },
    { key: 'department', header: 'القسم', render: (r) => r.department?.name || '—' },
    { key: 'position', header: 'المسمى', render: (r) => r.position?.name || '—', hideOnMobile: true },
    { key: 'salary', header: 'الراتب (د.ك)', render: (r) => <span className="tabular">{fmtKWD(r.basicSalary)}</span> },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'view', header: '',
      render: (r) => (
        <Button variant="ghost" size="sm" className="text-emerald-700" onClick={() => setProfileId(r.id)}>
          <Eye className="h-4 w-4" /> الملف
        </Button>
      ),
    },
  ];

  return (
    <>
      <CrudPanel<EmployeeRow>
        entityPath="/api/employees"
        entityLabel="موظف"
        title="الموظفون"
        subtitle="ملف موظف كامل بالصور والعقود والحضور والإجازات والرواتب"
        canWrite={canWrite}
        searchPlaceholder="بحث بالاسم أو الرقم الوظيفي أو الرقم المدني..."
        columns={columns}
        fields={[
          { key: 'code', label: 'الرقم الوظيفي (= PIN الجهاز)', type: 'text', required: true },
          { key: 'name', label: 'الاسم الكامل', type: 'text', required: true },
          { key: 'gender', label: 'الجنس', type: 'select', options: [{ value: 'ذكر', label: 'ذكر' }, { value: 'أنثى', label: 'أنثى' }] },
          { key: 'nationality', label: 'الجنسية', type: 'text' },
          { key: 'civilId', label: 'الرقم المدني', type: 'text' },
          { key: 'passportNo', label: 'رقم الجواز', type: 'text' },
          { key: 'phone', label: 'الهاتف', type: 'text' },
          { key: 'email', label: 'البريد الإلكتروني', type: 'text' },
          { key: 'departmentId', label: 'القسم', type: 'select' },
          { key: 'positionId', label: 'المسمى الوظيفي', type: 'select' },
          { key: 'hireDate', label: 'تاريخ التعيين', type: 'date' },
          { key: 'birthDate', label: 'تاريخ الميلاد', type: 'date' },
          { key: 'maritalStatus', label: 'الحالة الاجتماعية', type: 'select', options: [
            { value: 'أعزب/عزباء', label: 'أعزب/عزباء' }, { value: 'متزوج/متزوجة', label: 'متزوج/متزوجة' },
            { value: 'مطلق/مطلقة', label: 'مطلق/مطلقة' }, { value: 'أرمل/أرملة', label: 'أرمل/أرملة' },
          ] },
          { key: 'basicSalary', label: 'الراتب الأساسي (د.ك)', type: 'number' },
          { key: 'bankAccount', label: 'الحساب البنكي', type: 'text' },
          { key: 'status', label: 'الحالة', type: 'select', options: [
            { value: 'active', label: 'نشط' }, { value: 'suspended', label: 'موقوف' },
            { value: 'on_leave', label: 'في إجازة' }, { value: 'terminated', label: 'منصرف' },
            { value: 'deceased', label: 'متوفى (يُفضَّل التسجيل من تبويب نهاية الخدمة)' },
          ] },
          { key: 'weeklyOffDays', label: 'يوم الراحة الأسبوعية', type: 'select', options: WEEKLY_OFF_OPTIONS,
            hint: 'يُستخدم في الحضور والرواتب والإجازات وراتب شهر الترك' },
          { key: 'eosBasis', label: 'أساس مكافأة نهاية الخدمة', type: 'select', options: [
            { value: 'default', label: 'افتراضي الشركة (من الإعدادات)' },
            ...EOS_BASIS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ] },
          { key: 'pin', label: 'PIN الجهاز (افتراضي = الرقم الوظيفي)', type: 'text' },
          { key: 'address', label: 'العنوان', type: 'textarea', span: 2 },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{ status: 'active', basicSalary: 0, weeklyOffDays: 'shift', eosBasis: 'default' }}
        loadOptions={optionLoaders.combine(optionLoaders.departments, optionLoaders.positions)}
        rowToForm={(r) => ({
          ...r,
          hireDate: fmtDate(r.hireDate), birthDate: fmtDate(r.birthDate),
          departmentId: r.department?.id || '', positionId: r.position?.id || '',
          weeklyOffDays: r.weeklyOffDays || 'shift', eosBasis: r.eosBasis || 'default',
        })}
      />
      {profileId && (
        <EmployeeProfile id={profileId} open={!!profileId} onClose={() => setProfileId(null)} canWrite={canWrite} companyName={companyName} />
      )}
    </>
  );
}
