'use client';

// الأقسام الإدارية للمدير: سجل التدقيق، المستخدمون والأدوار، الإعدادات
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime, STATUS_AR, downloadFile } from '@/lib/client';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader, StatusBadge } from '@/components/hrhub/common';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Save, History, Undo2, Trash2, KeyRound, Plus } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ============================================================
// سجل التدقيق
// ============================================================
interface AuditRow extends Record<string, unknown> {
  id: string; action: string; entity: string; entityId?: string | null;
  description: string; changes?: string | null; createdAt: string;
  user?: { name: string; username: string; role: string } | null;
}

export function AuditSection() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '100' });
      if (action !== 'all') params.set('action', action);
      if (search) params.set('search', search);
      const data = await api<{ rows: AuditRow[]; total: number }>(`/api/audit?${params}`);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [action, search]);

  useEffect(() => { load(1); }, [action]);  
  useEffect(() => { load(page); }, [page]);  

  const ACTION_TONES: Record<string, string> = {
    create: 'bg-emerald-100 text-emerald-700', update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700', login: 'bg-gray-100 text-gray-700',
    sync: 'bg-violet-100 text-violet-700', import: 'bg-cyan-100 text-cyan-700',
    approve: 'bg-emerald-100 text-emerald-700', pay: 'bg-emerald-100 text-emerald-700',
    compute: 'bg-blue-100 text-blue-700', denied: 'bg-red-100 text-red-800 font-bold',
    reopen: 'bg-amber-100 text-amber-700', restore: 'bg-amber-100 text-amber-700', reset: 'bg-red-100 text-red-800',
  };

  const columns: Column<AuditRow>[] = [
    { key: 'time', header: 'الوقت', render: (r) => <span className="tabular text-xs">{fmtDateTime(r.createdAt)}</span> },
    { key: 'user', header: 'المستخدم', render: (r) => r.user ? `${r.user.name}` : 'النظام', hideOnMobile: true },
    { key: 'action', header: 'الإجراء', render: (r) => <span className={`rounded px-2 py-0.5 text-xs ${ACTION_TONES[r.action] || 'bg-gray-100'}`}>{r.action}</span> },
    { key: 'entity', header: 'الكيان', render: (r) => <span className="text-xs">{r.entity}</span>, hideOnMobile: true },
    { key: 'desc', header: 'الوصف العربي', render: (r) => <span className="text-sm">{r.description}</span> },
  ];

  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle="كل كتابة تُرصد بالمستخدم والإجراء والوصف العربي — محاولات الرفض 403 تُوثق أيضًا" />
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={action} onValueChange={setAction} dir="rtl">
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الإجراءات</SelectItem>
            {['create', 'update', 'delete', 'login', 'sync', 'import', 'approve', 'pay', 'compute', 'denied', 'reopen', 'restore', 'reset'].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="بحث في الوصف..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Button variant="outline" size="sm" onClick={() => load(1)}>بحث</Button>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} page={page} total={total} limit={100} onPage={setPage} maxBodyHeight="65vh" />
    </div>
  );
}

// ============================================================
// المستخدمون
// ============================================================
interface UserRow extends Record<string, unknown> {
  id: string; username: string; name: string; role: string; active: boolean;
  permissions?: string | null; createdAt: string; _count?: { sessions: number };
}

export function UsersSection() {
  return (
    <CrudPanel<UserRow>
      entityPath="/api/users"
      entityLabel="مستخدم"
      title="المستخدمون والأدوار"
      subtitle="خمسة أدوار: مدير النظام، موارد بشرية، محاسب، مشرف، مشاهد — مع صلاحيات JSON دقيقة تتجاوز الافتراضي"
      canWrite
      searchPlaceholder="بحث..."
      columns={[
        { key: 'name', header: 'المستخدم', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground font-mono">{r.username}</p></div> },
        { key: 'role', header: 'الدور', render: (r) => <StatusBadge status={r.role} /> },
        { key: 'active', header: 'الحالة', render: (r) => <StatusBadge status={r.active ? 'active' : 'suspended'} /> },
        { key: 'perm', header: 'صلاحيات دقيقة', render: (r) => r.permissions ? <code className="text-[11px] bg-muted px-1 rounded">{r.permissions}</code> : 'افتراضي الدور', hideOnMobile: true },
        { key: 'created', header: 'أُنشئ', render: (r) => <span className="tabular text-xs">{fmtDateTime(r.createdAt).slice(0, 10)}</span>, hideOnMobile: true },
      ]}
      fields={[
        { key: 'username', label: 'اسم المستخدم', type: 'text', required: true },
        { key: 'name', label: 'الاسم الكامل', type: 'text' },
        { key: 'password', label: 'كلمة السر', type: 'text', hint: 'للإنشاء إلزامية (6+) — للتعديل اتركها فارغة لعدم التغيير' },
        { key: 'role', label: 'الدور', type: 'select', options: [
          { value: 'admin', label: 'مدير النظام' }, { value: 'hr', label: 'موارد بشرية' },
          { value: 'accountant', label: 'محاسب' }, { value: 'supervisor', label: 'مشرف' }, { value: 'viewer', label: 'مشاهد' },
        ] },
        { key: 'permissions', label: 'صلاحيات JSON (اختياري)', type: 'textarea', span: 2, hint: 'مثال: {"payroll": true, "devices": false}' },
        { key: 'active', label: 'الحساب نشط', type: 'switch' },
      ]}
      defaultValues={{ role: 'viewer', active: true }}
      rowToForm={(r) => ({ username: r.username, name: r.name, role: r.role, permissions: r.permissions || '', active: r.active, password: '' })}
    />
  );
}

// ============================================================
// الإعدادات
// ============================================================
interface SettingsData {
  companyName: string; workDaysPerMonth: number; hoursPerDay: number;
  otWeekdayMult: number; otHolidayMult: number; lateDeductionMode: string;
  socialSecurityEnabled: boolean; sscEmployeeCitizen: number; sscEmployerCitizen: number; sscEmployerExpatriate: number;
  defaultShiftId: string | null; autoAcceptDevices: boolean; admsEnabled: boolean;
  biotimeEnabled: boolean; biotimeUrl: string; biotimeUsername: string;
  biotimeAutoSyncMinutes: number; deviceOfflineAlertMinutes: number;
  hasBiotimePassword?: boolean;
}

interface RestoreRow { id: string; description: string; createdAt: string; user?: { name: string } | null }

export function SettingsSection() {
  const [s, setS] = useState<SettingsData | null>(null);
  const [shifts, setShifts] = useState<{ value: string; label: string }[]>([]);
  const [biotimePassword, setBiotimePassword] = useState('');
  const [restores, setRestores] = useState<RestoreRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<SettingsData>('/api/settings');
    setS(data);
    const rs = await api<{ rows: RestoreRow[] }>('/api/restore');
    setRestores(rs.rows);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  useEffect(() => { optionLoaders.shifts().then((o) => setShifts(o.shiftId || [])).catch(() => {}); }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...s };
      if (biotimePassword) payload.biotimePassword = biotimePassword;
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast.success('حُفظت الإعدادات');
      setBiotimePassword('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const clearDemo = async () => {
    try {
      await api('/api/settings', { method: 'DELETE' });
      toast.success('مُسحت البيانات التشغيلية (سجلات/حضور/رواتب/إجازات/عقود)');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل المسح');
    }
  };

  const restore = async (id: string, description: string) => {
    try {
      await api(`/api/restore/${id}`, { method: 'POST' });
      toast.success(`استُعيدت نقطة: ${description}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الاستعادة');
    }
  };

  if (!s) return <p className="py-20 text-center text-muted-foreground">جارٍ تحميل الإعدادات...</p>;

  const set = (k: keyof SettingsData, v: unknown) => setS({ ...s, [k]: v } as SettingsData);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="الإعدادات" subtitle="عام، معادلات الرواتب، ADMS وBioTime، نقاط الاستعادة" />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">عام</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label className="mb-1.5">اسم الجهة</Label>
            <Input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">معادلات الرواتب</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5">أيام عمل الشهر (26 القاعدة الكويتية)</Label>
            <Input type="number" value={s.workDaysPerMonth} onChange={(e) => set('workDaysPerMonth', parseFloat(e.target.value) || 26)} />
          </div>
          <div>
            <Label className="mb-1.5">ساعات اليوم</Label>
            <Input type="number" value={s.hoursPerDay} onChange={(e) => set('hoursPerDay', parseFloat(e.target.value) || 8)} />
          </div>
          <div>
            <Label className="mb-1.5">مضاعف الإضافي (يوم عمل)</Label>
            <Input type="number" step="0.05" value={s.otWeekdayMult} onChange={(e) => set('otWeekdayMult', parseFloat(e.target.value) || 1.25)} />
          </div>
          <div>
            <Label className="mb-1.5">مضاعف الإضافي (عطلة/راحة)</Label>
            <Input type="number" step="0.05" value={s.otHolidayMult} onChange={(e) => set('otHolidayMult', parseFloat(e.target.value) || 1.5)} />
          </div>
          <div>
            <Label className="mb-1.5">الوردية الافتراضية</Label>
            <Select value={s.defaultShiftId || ''} onValueChange={(v) => set('defaultShiftId', v)} dir="rtl">
              <SelectTrigger dir="rtl"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>{shifts.map((sh) => <SelectItem key={sh.value} value={sh.value}>{sh.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">وضع خصم التأخير</Label>
            <Select value={s.lateDeductionMode} onValueChange={(v) => set('lateDeductionMode', v)} dir="rtl">
              <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">أجر الدقيقة × دقائق التأخير</SelectItem>
                <SelectItem value="none">بدون خصم تلقائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium text-sm">التأمينات الاجتماعية</p>
              <p className="text-xs text-muted-foreground">مواطن: 5.5% موظف + 11.5% جهة عمل — مقيم: 2.5% جهة عمل (قابلة للتعديل)</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-bold ${s.socialSecurityEnabled ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.socialSecurityEnabled ? 'مفعّل' : 'متوقف'}</span>
              <Switch checked={s.socialSecurityEnabled} onCheckedChange={(v) => set('socialSecurityEnabled', v)} />
            </div>
          </div>
          {s.socialSecurityEnabled && (
            <>
              <div><Label className="mb-1.5">موظف مواطن %</Label><Input type="number" step="0.5" value={s.sscEmployeeCitizen} onChange={(e) => set('sscEmployeeCitizen', parseFloat(e.target.value) || 0)} /></div>
              <div><Label className="mb-1.5">جهة عمل مواطن %</Label><Input type="number" step="0.5" value={s.sscEmployerCitizen} onChange={(e) => set('sscEmployerCitizen', parseFloat(e.target.value) || 0)} /></div>
              <div><Label className="mb-1.5">جهة عمل مقيم %</Label><Input type="number" step="0.5" value={s.sscEmployerExpatriate} onChange={(e) => set('sscEmployerExpatriate', parseFloat(e.target.value) || 0)} /></div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ADMS وأجهزة البصمة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><p className="font-medium text-sm">استقبال أجهزة ADMS (المسار /iclock/)</p><p className="text-xs text-muted-foreground">اضبط الجهاز: Server IP = دومين النظام، Port = 80، Path = /iclock/</p></div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-bold ${s.admsEnabled ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.admsEnabled ? 'مفعّل' : 'متوقف'}</span>
              <Switch checked={s.admsEnabled} onCheckedChange={(v) => set('admsEnabled', v)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><p className="font-medium text-sm">قبول الأجهزة الجديدة تلقائيًا</p><p className="text-xs text-muted-foreground">مع تنبيه في لوحة التحكم لتوثيقها</p></div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-bold ${s.autoAcceptDevices ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.autoAcceptDevices ? 'مفعّل' : 'متوقف'}</span>
              <Switch checked={s.autoAcceptDevices} onCheckedChange={(v) => set('autoAcceptDevices', v)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5">تنبيه انقطاع الجهاز بعد (دقيقة)</Label>
            <Input type="number" value={s.deviceOfflineAlertMinutes} onChange={(e) => set('deviceOfflineAlertMinutes', parseFloat(e.target.value) || 10)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">مزامنة BioTime (اختياري)</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <p className="font-medium text-sm">تفعيل السحب من خادم BioTime قائم (REST)</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-bold ${s.biotimeEnabled ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.biotimeEnabled ? 'مفعّل' : 'متوقف'}</span>
              <Switch checked={s.biotimeEnabled} onCheckedChange={(v) => set('biotimeEnabled', v)} />
            </div>
          </div>
          {s.biotimeEnabled && (
            <>
              <div className="sm:col-span-2">
                <Label className="mb-1.5">عنوان الخادم</Label>
                <Input value={s.biotimeUrl} onChange={(e) => set('biotimeUrl', e.target.value)} placeholder="http://192.168.1.10" dir="ltr" />
              </div>
              <div>
                <Label className="mb-1.5">اسم المستخدم</Label>
                <Input value={s.biotimeUsername} onChange={(e) => set('biotimeUsername', e.target.value)} dir="ltr" />
              </div>
              <div>
                <Label className="mb-1.5">كلمة السر {s.hasBiotimePassword && '(محفوظة مشفرة)'}</Label>
                <Input type="password" value={biotimePassword} onChange={(e) => setBiotimePassword(e.target.value)} placeholder="اتركها فارغة للإبقاء" dir="ltr" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</Button>
      </div>

      {/* نقاط الاستعادة */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> نقاط الاستعادة التلقائية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {restores.length === 0 && <p className="text-sm text-muted-foreground">لا توجد نقاط بعد — تُنشأ تلقائيًا بعد كل كتابة.</p>}
          {restores.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
              <Undo2 className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.description}</p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}{r.user ? ` · ${r.user.name}` : ''}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">استعادة</Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>استعادة نقطة؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيُرجع المحتوى المأخوذ في اللقطة (أقسام، موظفون، عقود، ورديات، إجازات، أجهزة) — سجلات البصمة والحضور لا تُمس.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={() => restore(r.id, r.description)}>استعادة</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* مسح بيانات تجريبية */}
      <Card className="border-red-200">
        <CardHeader className="pb-2"><CardTitle className="text-base text-red-700">منطقة الخطر</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">مسح البيانات التشغيلية التجريبية: سجلات البصمة، الحضور، الرواتب، الإجازات، العقود — يبقى الموظفون والأقسام والأجهزة.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /> مسح</Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>مسح البيانات التشغيلية؟</AlertDialogTitle>
                <AlertDialogDescription>عملية حساسة تُسجل في التدقيق. موظفون/أقسام/أجهزة تُبقى.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={clearDemo}>مسح نهائي</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
