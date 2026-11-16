'use client';

// الأجهزة: أونلاين (ADMS Push) + محلية (سحب عبر IP:4370) + استيراد USB + الحالة الحية
import { useState } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { CrudPanel } from '@/components/hrhub/crud-panel';
import { StatusBadge } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlugZap, Fingerprint, UserPlus } from 'lucide-react';

interface DeviceRow extends Record<string, unknown> {
  id: string; sn: string; name: string; model?: string | null; location?: string | null;
  ipAddress?: string | null; port?: number | null; mode?: string; vendor?: string; apiUser?: string | null; useHttps?: boolean;
  lastSeenAt?: string | null; lastIp?: string | null; lastPullAt?: string | null;
  status: string; enabled: boolean; pushVersion?: string | null;
  _count?: { attendanceLogs: number };
}

interface ImportResult {
  onDevice: number; created: number; existing: number; linkedPunches: number;
  createdList: { code: string; name: string }[]; message: string;
}

interface TestResult {
  online: boolean; lastSeenAt?: string | null; lastIp?: string | null; message: string;
  admsGuide: Record<string, string>;
}

interface PullResult {
  pulled: boolean; inserted: number; duplicates: number; totalOnDevice: number;
  daysRecomputed: number; matchedUsers: number; deviceSn: string; durationMs: number;
  message: string; photos?: number; api?: string;
}

export function DevicesSection({ canWrite }: { canWrite: boolean }) {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);

  const testDevice = async (row: DeviceRow) => {
    try {
      const res = await api<TestResult>(`/api/devices/${row.id}/test`, { method: 'POST' });
      setTestResult(res);
      toast.success(res.online ? 'الجهاز متصل — أُصدر أمر CHECKIN' : 'أُصدر الأمر — سيُستلم عند عودة الاتصال');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الاختبار');
    }
  };

  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  /** استيراد موظفي الجهاز إلى النظام + ربط بصماتهم السابقة */
  const importUsers = async (row: DeviceRow) => {
    setImporting(row.id);
    try {
      const res = await api<ImportResult>(`/api/devices/${row.id}/import-users`, { method: 'POST' });
      setImportResult(res);
      toast.success(res.message);
      window.dispatchEvent(new Event('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل استيراد الموظفين من الجهاز');
    } finally {
      setImporting(null);
    }
  };

  const pullDevice = async (row: DeviceRow) => {
    setPulling(row.id);
    try {
      const res = await api<PullResult>(`/api/devices/${row.id}/pull`, { method: 'POST' });
      setPullResult(res);
      toast.success(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل السحب من الجهاز');
    } finally {
      setPulling(null);
    }
  };

  const renderRowActions = (r: DeviceRow) => (
    <>
      {r.mode === 'local' && r.ipAddress ? (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" title="سحب البصمات من الجهاز الآن"
          disabled={pulling === r.id}
          onClick={(e) => { e.stopPropagation(); pullDevice(r); }}>
          <Fingerprint className={`h-3.5 w-3.5 ${pulling === r.id ? 'animate-pulse' : ''}`} />
        </Button>
      ) : r.mode === 'push' ? (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-teal-700" title="اختبار الاتصال (ADMS)"
          onClick={(e) => { e.stopPropagation(); testDevice(r); }}>
          <PlugZap className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground px-1.5" title="جهاز موثق من استيراد USB — أدخل IP له لتفعيل السحب">USB</span>
      )}
      {r.mode === 'local' && r.ipAddress && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-teal-700" title="إضافة موظفي الجهاز للنظام وربط بصماتهم"
          disabled={importing === r.id}
          onClick={(e) => { e.stopPropagation(); importUsers(r); }}>
          <UserPlus className={`h-3.5 w-3.5 ${importing === r.id ? 'animate-pulse' : ''}`} /> استيراد الموظفين
        </Button>
      )}
    </>
  );

  return (
    <>
      <CrudPanel<DeviceRow>
        entityPath="/api/devices"
        entityLabel="جهاز"
        title="أجهزة البصمة"
        subtitle="ZKTeco (أونلاين ADMS أو محلي 4370) و ACTAtek (سحب الحركات بالصور من IP الجهاز) + استيراد ملف USB"
        canWrite={canWrite}
        searchPlaceholder="بحث بالاسم أو SN أو الموقع..."
        columns={[
          { key: 'name', header: 'الجهاز', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground font-mono">{r.sn}</p></div> },
          { key: 'mode', header: 'النوع', render: (r) => (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${r.mode === 'local' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {r.vendor === 'actatek' ? 'ACTAtek (سحب بالصور)' : r.mode === 'local' ? 'ZKTeco محلي (4370)' : 'ZKTeco أونلاين (ADMS)'}
            </span>
          ), hideOnMobile: true },
          { key: 'ip', header: 'IP:المنفذ', render: (r) => r.ipAddress ? <span className="font-mono text-xs">{r.ipAddress}{r.port ? `:${r.port}` : ''}</span> : '—', hideOnMobile: true },
          { key: 'location', header: 'الموقع', render: (r) => r.location || '—', hideOnMobile: true },
          { key: 'status', header: 'الحالة الحية', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'lastSeen', header: 'آخر ظهور/سحب', render: (r) => <span className="tabular text-xs">{fmtDateTime(r.mode === 'local' ? r.lastPullAt : r.lastSeenAt) || (r.mode === 'local' ? 'لم يسحب بعد' : 'لم يتصل بعد')}</span>, hideOnMobile: true },
          { key: 'logs', header: 'سجلاته', render: (r) => <span className="tabular">{r._count?.attendanceLogs ?? 0}</span> },
          { key: 'enabled', header: 'مفعّل', render: (r) => r.enabled ? 'نعم' : 'لا', hideOnMobile: true },
        ]}
        fields={[
          { key: 'name', label: 'اسم الجهاز', type: 'text', required: true },
          { key: 'sn', label: 'الرقم التسلسلي SN', type: 'text', hint: 'اختياري للأجهزة المحلية — يُقرأ من الجهاز تلقائيًا عند أول سحب. مطلوب لأجهزة ADMS (من قائمة الجهاز: Device Info)' },
          { key: 'vendor', label: 'نوع الجهاز (الشركة)', type: 'select', options: [
            { value: 'zkteco', label: 'ZKTeco' },
            { value: 'actatek', label: 'ACTAtek' },
          ], hint: 'ACTAtek يُسحب دائمًا من الشبكة (بالاسم والصورة) — أدخل IP ومستخدم الجهاز' },
          { key: 'mode', label: 'نوع الاتصال', type: 'select', options: [
            { value: 'push', label: 'أونلاين — ADMS Push (الجهاز يرسل إلى النظام)' },
            { value: 'local', label: 'محلي — سحب من الشبكة (النظام يتصل بالجهاز)' },
          ] },
          { key: 'ipAddress', label: 'IP الجهاز (للوضع المحلي)', type: 'text', hint: 'مثال: 192.168.1.201 — من قائمة الجهاز: Comm → Ethernet' },
          { key: 'port', label: 'المنفذ (4370 افتراضيًا)', type: 'number' },
          { key: 'commKey', label: 'مفتاح الاتصال CommKey — ZKTeco (اختياري)', type: 'text', hint: 'إن عُدّل من قائمة الجهاز — الافتراضي 0' },
          { key: 'apiUser', label: 'مستخدم الجهاز — ACTAtek', type: 'text', hint: 'مستخدم بصلاحية مدير على الجهاز (نفس دخول صفحة الجهاز على المتصفح)' },
          { key: 'apiPassword', label: 'كلمة سر الجهاز — ACTAtek', type: 'text', hint: 'تُحفظ مشفرة — اتركها كما هي للإبقاء على الحالية' },
          { key: 'useHttps', label: 'الاتصال عبر HTTPS — ACTAtek', type: 'switch' },
          { key: 'model', label: 'الموديل', type: 'text' },
          { key: 'location', label: 'الموقع', type: 'text' },
          { key: 'enabled', label: 'الجهاز مفعّل', type: 'switch' },
        ]}
        defaultValues={{ enabled: true, mode: 'push', port: 4370, vendor: 'zkteco', useHttps: false }}
        rowActions={canWrite ? renderRowActions : undefined}
      />

      {/* دليل الجهاز المحلي */}
      <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm space-y-1.5">
        <p className="font-bold text-teal-900">🔧 الجهاز المحلي (لا يرسل ADMS) — خطوات التجهيز:</p>
        <p className="text-teal-800">1. من قائمة الجهاز: Comm → Ethernet — سجّل IP ثابتًا (مثال 192.168.1.201) وتأكد أن المنفذ 4370.</p>
        <p className="text-teal-800">2. أضف الجهاز هنا باختيار «محلي — سحب من الشبكة» وأدخل نفس الـ IP.</p>
        <p className="text-teal-800">3. يجب أن يكون السيرفر (أو الـ VPS الوسيط) على نفس الشبكة أو يصل للجهاز عبر Port Forwarding على 4370.</p>
        <p className="text-teal-800">4. اضغط أيقونة البصمة 🔑 بجانب الجهاز لسحب السجلات فورًا — إعادة السحب لا تكرر السجلات أبدًا.</p>
        <p className="text-teal-800">5. لو الجهاز في شبكة مقفولة بلا وصول من السيرفر: صدّر منه ملف USB واستورده من قسم «سجل البصمة ← استيراد من USB».</p>
      </div>

      <Dialog open={!!testResult} onOpenChange={(o) => !o && setTestResult(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>نتيجة اختبار الاتصال</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className={`rounded-lg border p-3 text-sm ${testResult?.online ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              {testResult?.message}
            </div>
            {testResult?.lastSeenAt && (
              <p className="text-sm text-muted-foreground">آخر ظهور: {fmtDateTime(testResult.lastSeenAt)} · آخر IP: {testResult.lastIp || '—'}</p>
            )}
            <div className="rounded-lg border p-3 text-sm space-y-1.5 bg-muted/40">
              <p className="font-bold">إرشاد ضبط ADMS خطوة بخطوة:</p>
              {Object.values(testResult?.admsGuide || {}).map((step, i) => (
                <p key={i} className="flex gap-2"><span className="font-bold text-emerald-700">{i + 1}.</span> {step}</p>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestResult(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pullResult} onOpenChange={(o) => !o && setPullResult(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>نتيجة السحب من الجهاز المحلي</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-200 text-emerald-900 font-medium">
              {pullResult?.message}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">سجلات على الجهاز</p><p className="tabular font-bold">{pullResult?.totalOnDevice ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">جديدة مُدرجة</p><p className="tabular font-bold text-emerald-700">{pullResult?.inserted ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">مكررات متجاهلة</p><p className="tabular font-bold">{pullResult?.duplicates ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">أيام أعيد حسابها</p><p className="tabular font-bold">{pullResult?.daysRecomputed ?? 0}</p></div>
            </div>
            {pullResult?.matchedUsers ? (
              <p className="text-teal-700">🔗 طوبق {pullResult.matchedUsers} مستخدمًا من الجهاز بالاسم وربط تلقائي</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              SN الجهاز: {pullResult?.deviceSn} · المدة: {pullResult?.durationMs} مللي ثانية — المصدر موثق «محلي» في سجل البصمة
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullResult(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>استيراد الموظفين من الجهاز</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">{importResult?.message}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">على الجهاز</p><p className="tabular font-bold">{importResult?.onDevice ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">أضيفوا</p><p className="tabular font-bold text-emerald-700">{importResult?.created ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">موجودون</p><p className="tabular font-bold">{importResult?.existing ?? 0}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">بصمات رُبطت</p><p className="tabular font-bold text-teal-700">{importResult?.linkedPunches ?? 0}</p></div>
            </div>
            {!!importResult?.createdList.length && (
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs"><thead className="bg-muted/60"><tr><th className="p-1.5 text-right">الرقم</th><th className="p-1.5 text-right">الاسم</th></tr></thead>
                  <tbody>{importResult.createdList.map((u) => <tr key={u.code} className="border-t"><td className="p-1.5 tabular">{u.code}</td><td className="p-1.5">{u.name}</td></tr>)}</tbody></table>
              </div>
            )}
            <p className="text-xs text-amber-700">الموظفون الجدد أضيفوا براتب 0 — أكمل الراتب والقسم وتاريخ التعيين ويوم الراحة من صفحة الموظفين قبل حساب الرواتب.</p>
          </div>
          <DialogFooter><Button onClick={() => setImportResult(null)}>تم</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
