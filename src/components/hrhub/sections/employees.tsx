'use client';

// الموظفون: جدول بالصور + ملف كامل بتبويبات (بيانات، عقود، حضور، إجازات، رواتب، ملفات)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtKWD, fmtDate, STATUS_AR } from '@/lib/client';
import { Column } from '@/components/hrhub/data-table';
import { StatusBadge } from '@/components/hrhub/common';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Eye, X } from 'lucide-react';
import { EmployeePage } from '@/components/hrhub/employee/employee-page';
import { WEEKLY_OFF_OPTIONS } from '@/lib/workweek';
import { EOS_BASIS_OPTIONS } from '@/lib/indemnity';

interface EmployeeRow extends Record<string, unknown> {
  id: string; code: string; name: string; photoId?: string | null;
  department?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
  status: string; basicSalary: number; phone?: string | null; pin?: string | null;
  weeklyOffDays?: string | null; eosBasis?: string | null; otEligible?: boolean; attendanceExempt?: boolean;
  nationality?: string | null; civilId?: string | null; hireDate?: string | null; birthDate?: string | null;
  photo?: { id: string } | null;
  _count?: { contracts: number; leaveRequests: number };
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

const ALL = 'all';

export function EmployeesSection({ canWrite, companyName }: { canWrite: boolean; companyName: string }) {
  const [profile, setProfile] = useState<EmployeeRow | null>(null);
  const [filters, setFilters] = useState({ department: ALL, position: ALL, status: 'active', nationality: '' });
  const [lists, setLists] = useState<{ departments: { value: string; label: string }[]; positions: { value: string; label: string }[] }>({ departments: [], positions: [] });
  useEffect(() => {
    optionLoaders.combine(optionLoaders.departments, optionLoaders.positions)()
      .then((o) => setLists({ departments: o.departmentId || [], positions: o.positionId || [] }))
      .catch(() => {});
  }, []);

  /** فلاتر الشاشة: القسم + المسمى + الحالة + الجنسية (مع البحث بالاسم/الرقم/المدني/الهاتف من الخانة العلوية) */
  const filterRows = useMemo(() => (rows: EmployeeRow[]) => rows.filter((r) =>
    (filters.department === ALL || r.department?.id === filters.department) &&
    (filters.position === ALL || r.position?.id === filters.position) &&
    (filters.status === ALL || r.status === filters.status) &&
    (!filters.nationality || (r.nationality || '').toLowerCase().includes(filters.nationality.toLowerCase()))
  ), [filters]);
  const filtered = filters.department !== ALL || filters.position !== ALL || filters.status !== 'active' || !!filters.nationality;

  const columns: Column<EmployeeRow>[] = [
    {
      key: 'name', header: 'الموظف',
      render: (r) => (
        <button className="flex items-center gap-2.5 text-right hover:underline" onClick={() => setProfile(r)}>
          <Avatar emp={r} />
          <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground tabular">{r.code}</p></div>
        </button>
      ),
    },
    { key: 'department', header: 'القسم', render: (r) => r.department?.name || '—' },
    { key: 'position', header: 'المسمى', render: (r) => r.position?.name || '—', hideOnMobile: true },
    { key: 'nationality', header: 'الجنسية', render: (r) => r.nationality || '—', hideOnMobile: true },
    { key: 'civilId', header: 'الرقم المدني', render: (r) => <span className="tabular">{r.civilId || '—'}</span>, hideOnMobile: true },
    { key: 'phone', header: 'الهاتف', render: (r) => <span className="tabular" dir="ltr">{r.phone || '—'}</span>, hideOnMobile: true },
    { key: 'hireDate', header: 'التعيين', render: (r) => <span className="tabular">{r.hireDate ? fmtDate(r.hireDate) : '—'}</span>, hideOnMobile: true },
    { key: 'salary', header: 'الأساسي', render: (r) => <span className="tabular">{fmtKWD(r.basicSalary)}</span> },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'view', header: '',
      render: (r) => (
        <Button variant="ghost" size="sm" className="text-emerald-700" onClick={() => setProfile(r)}>
          <Eye className="h-4 w-4" /> كل التفاصيل
        </Button>
      ),
    },
  ];

  const filterSelect = (key: 'department' | 'position' | 'status', placeholder: string, options: { value: string; label: string }[]) => (
    <Select value={filters[key]} onValueChange={(v) => setFilters({ ...filters, [key]: v })} dir="rtl">
      <SelectTrigger dir="rtl" className="w-40 h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: الكل</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const filtersBar = (
    <div className="flex flex-wrap items-center gap-2">
      {filterSelect('department', 'القسم', lists.departments)}
      {filterSelect('position', 'المسمى', lists.positions)}
      {filterSelect('status', 'الحالة', ['active', 'on_leave', 'suspended', 'terminated', 'deceased'].map((v) => ({ value: v, label: STATUS_AR[v] || v })))}
      <Input className="w-36 h-9" placeholder="الجنسية" value={filters.nationality} onChange={(e) => setFilters({ ...filters, nationality: e.target.value })} />
      {filtered && (
        <Button variant="ghost" size="sm" onClick={() => setFilters({ department: ALL, position: ALL, status: 'active', nationality: '' })}>
          <X className="h-4 w-4" /> مسح الفلاتر
        </Button>
      )}
    </div>
  );

  return (
    <>
      <CrudPanel<EmployeeRow>
        entityPath="/api/employees"
        entityLabel="موظف"
        title="الموظفون"
        subtitle="ملف موظف كامل بالصور والعقود والحضور والإجازات والرواتب"
        canWrite={canWrite}
        searchPlaceholder="بحث بالاسم أو الرقم الوظيفي أو الرقم المدني أو الهاتف..."
        filtersBar={filtersBar}
        filterRows={filterRows}
        onRowClick={setProfile}
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
          { key: 'openingLeaveBalance', label: 'رصيد الإجازة الافتتاحي (يوم)', type: 'number', hint: 'الرصيد المنقول من النظام القديم (MenaITech) — اتركه فارغًا ليُحسب من تاريخ التعيين' },
          { key: 'openingLeaveDate', label: 'بتاريخ (الرصيد الافتتاحي)', type: 'date' },
          { key: 'otEligible', label: 'يستحق العمل الإضافي (يُصرف في الراتب)', type: 'switch' },
          { key: 'attendanceExempt', label: 'معفى من البصمة (راتب كامل بلا خصم غياب)', type: 'switch' },
          { key: 'pin', label: 'PIN الجهاز (افتراضي = الرقم الوظيفي)', type: 'text' },
          { key: 'address', label: 'العنوان', type: 'textarea', span: 2 },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{ status: 'active', basicSalary: 0, weeklyOffDays: 'shift', eosBasis: 'default', otEligible: false, attendanceExempt: false }}
        loadOptions={optionLoaders.combine(optionLoaders.departments, optionLoaders.positions)}
        rowToForm={(r) => ({
          ...r,
          hireDate: r.hireDate ? fmtDate(r.hireDate) : '', birthDate: r.birthDate ? fmtDate(r.birthDate) : '',
          departmentId: r.department?.id || '', positionId: r.position?.id || '',
          weeklyOffDays: r.weeklyOffDays || 'shift', eosBasis: r.eosBasis || 'default',
          otEligible: !!r.otEligible, attendanceExempt: !!r.attendanceExempt,
          openingLeaveDate: r.openingLeaveDate ? fmtDate(r.openingLeaveDate as string) : '',
        })}
      />
      {profile && (
        <EmployeePage id={profile.id} open onClose={() => setProfile(null)} canWrite={canWrite} companyName={companyName}
          accountPanel={<EssAccountPanel employeeId={profile.id} defaultUsername={profile.code} defaultEmail={String(profile.email || '')} />} />
      )}
    </>
  );
}

/** حساب بوابة الموظف: إنشاء/إعادة تعيين كلمة السر/إيقاف — كلمة السر المولدة تظهر مرة واحدة */
function EssAccountPanel({ employeeId, defaultUsername, defaultEmail }: { employeeId: string; defaultUsername: string; defaultEmail: string }) {
  const [account, setAccount] = useState<{ username: string; email: string | null; active: boolean } | null | undefined>(undefined);
  const [form, setForm] = useState({ username: defaultUsername, email: defaultEmail });
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ account: { username: string; email: string | null; active: boolean } | null }>(`/api/employees/${employeeId}/account`);
      setAccount(d.account);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
      setAccount(null);
    }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setBusy(true);
    try {
      const d = await api<{ username: string; password: string }>(`/api/employees/${employeeId}/account`, {
        method: 'POST', body: JSON.stringify({ username: form.username, email: form.email }),
      });
      setIssued(d);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل العملية'); } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api(`/api/employees/${employeeId}/account`, { method: 'DELETE' });
      toast.success('أُوقف الحساب');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الإيقاف'); } finally { setBusy(false); }
  };

  if (account === undefined) return <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">يدخل الموظف من نفس رابط النظام (ويمكن تثبيته على الموبايل) ليرى رصيد إجازاته وقسائمه وحضوره ويقدّم طلباته.</p>
      {account ? (
        <div className="rounded-lg border p-3 space-y-1">
          <p>اسم المستخدم: <b className="font-mono">{account.username}</b></p>
          <p>الحالة: {account.active ? <span className="text-emerald-700">نشط</span> : <span className="text-red-700">موقوف</span>}</p>
          {account.email && <p>البريد: {account.email}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="mb-1.5 block">اسم المستخدم</Label><Input dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><Label className="mb-1.5 block">البريد (للإشعارات)</Label><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
      )}
      {issued && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <p className="font-bold">سلّم هذه البيانات للموظف — لن تظهر كلمة السر مرة أخرى:</p>
          <p className="font-mono mt-1">المستخدم: {issued.username}</p>
          <p className="font-mono">كلمة السر: {issued.password}</p>
          <p className="text-[11px] text-muted-foreground mt-1">يستطيع الموظف تغييرها من «حسابي» داخل البوابة.</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={issue} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
          {account ? (account.active ? 'إعادة تعيين كلمة السر' : 'تفعيل وإعادة تعيين كلمة السر') : 'إنشاء حساب'}
        </Button>
        {account?.active && <Button variant="outline" className="text-red-700" onClick={disable} disabled={busy}>إيقاف الحساب</Button>}
      </div>
    </div>
  );
}
