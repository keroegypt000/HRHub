'use client';

// أجهزة البصمة — ثلاثة أنواع واضحة، وكل نوع يعرض حقوله فقط:
//  1) ZKTeco سحب من الشبكة (البرنامج يتصل بالجهاز عبر IP — الأنسب للنسخة المكتبية)
//  2) ZKTeco يرسل للبرنامج (Cloud / ADMS — الجهاز يتصل بالبرنامج)
//  3) ACTAtek (سحب الحركات بالصور والأسماء عبر IP)
import { useState } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { CrudPanel, FieldDef } from '@/components/hrhub/crud-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlugZap, Fingerprint, UserPlus, Wifi, WifiOff, CircleHelp, Network, Send, Camera } from 'lucide-react';

type Kind = 'zk-local' | 'zk-push' | 'actatek';

interface DeviceRow extends Record<string, unknown> {
  id: string; sn: string; name: string; model?: string | null; location?: string | null;
  ipAddress?: string | null; port?: number | null; mode?: string; vendor?: string; kind?: Kind;
  apiUser?: string | null; useHttps?: boolean; lastError?: string | null;
  lastSeenAt?: string | null; lastIp?: string | null; lastPullAt?: string | null;
  status: string; enabled: boolean; pushVersion?: string | null;
  _count?: { attendanceLogs: number };
}

interface TestResult {
  ok: boolean; message: string; kind: Kind;
  info?: { model?: string; sn?: string; users?: number; logs?: number; capacity?: number; protocol?: string };
  admsGuide?: string[];
}
interface PullResult {
  inserted: number; duplicates: number; totalOnDevice: number; daysRecomputed: number; photos?: number;
  matchedUsers: number; deviceSn: string; durationMs: number; message: string; api?: string;
}
interface ImportResult {
  onDevice: number; created: number; existing: number; linkedPunches: number;
  createdList: { code: string; name: string }[]; message: string;
}

const KINDS: { value: Kind; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'zk-local', title: 'ZKTeco — سحب من الشبكة', desc: 'البرنامج يتصل بالجهاز عن طريق الـ IP ويسحب البصمات تلقائيًا كل 5 دقائق. الأنسب لو الجهاز والبرنامج على نفس الشبكة.', icon: Network },
  { value: 'zk-push', title: 'ZKTeco — الجهاز يرسل للبرنامج', desc: 'Cloud / ADMS: الجهاز نفسه يبعت البصمات فور تسجيلها. يحتاج ضبط عنوان السيرفر من قائمة الجهاز.', icon: Send },
  { value: 'actatek', title: 'ACTAtek — سحب بالصور', desc: 'البرنامج يتصل بالجهاز عن طريق الـ IP ويسحب الحركات بالأسماء وصورة كل بصمة.', icon: Camera },
];
const kindOf = (r: { kind?: string; vendor?: string; mode?: string }): Kind =>
  (r.kind as Kind) || (r.vendor === 'actatek' ? 'actatek' : r.mode === 'push' ? 'zk-push' : 'zk-local');
const isKind = (...k: Kind[]) => (f: Record<string, unknown>) => k.includes((f.kind as Kind) || 'zk-local');

const STATUS = {
  online: { label: 'متصل', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Wifi },
  offline: { label: 'غير متصل', cls: 'bg-red-50 text-red-700 border-red-200', icon: WifiOff },
  unknown: { label: 'لم يُختبر بعد', cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: CircleHelp },
} as const;

const FIELDS: FieldDef[] = [
  { key: 'kind', label: 'نوع الجهاز وطريقة الربط', type: 'select', required: true, span: 2,
    options: KINDS.map((k) => ({ value: k.value, label: k.title })),
    hint: (f) => KINDS.find((k) => k.value === f.kind)?.desc || '' },
  { key: 'name', label: 'اسم الجهاز', type: 'text', required: true, placeholder: 'مثال: بصمة المدخل الرئيسي' },
  { key: 'location', label: 'الموقع', type: 'text', placeholder: 'مثال: الفرع الرئيسي' },
  { key: 'ipAddress', label: 'عنوان IP الجهاز', type: 'text', placeholder: '192.168.1.200',
    showIf: isKind('zk-local', 'actatek'), requiredIf: isKind('zk-local', 'actatek'),
    hint: (f) => f.kind === 'actatek' ? 'نفس العنوان اللي بتفتح بيه صفحة الجهاز في المتصفح' : 'من قائمة الجهاز: Comm ← Ethernet ← IP Address' },
  { key: 'port', label: 'المنفذ', type: 'number', showIf: isKind('zk-local', 'actatek'), placeholder: 'تلقائي',
    hint: (f) => f.kind === 'actatek' ? 'اتركه فارغًا = 80 (أو 443 مع HTTPS)' : 'اتركه فارغًا = 4370 ما لم يتغير من قائمة الجهاز' },
  { key: 'commKey', label: 'مفتاح الاتصال Comm Key', type: 'text', showIf: isKind('zk-local'), placeholder: '0',
    hint: 'اتركه فارغًا ما لم يكن متغيرًا من قائمة الجهاز (Comm ← Comm Key)' },
  { key: 'apiUser', label: 'اسم مستخدم الجهاز', type: 'text', showIf: isKind('actatek'), requiredIf: isKind('actatek'),
    hint: 'مستخدم بصلاحية مدير على جهاز ACTAtek' },
  { key: 'apiPassword', label: 'كلمة سر الجهاز', type: 'text', showIf: isKind('actatek'),
    hint: 'تُحفظ مشفرة — عند التعديل اتركها كما هي للإبقاء على الحالية' },
  { key: 'useHttps', label: 'الاتصال عبر HTTPS', type: 'switch', showIf: isKind('actatek') },
  { key: 'sn', label: 'الرقم التسلسلي SN', type: 'text', showIf: isKind('zk-push'), requiredIf: isKind('zk-push'),
    hint: 'من قائمة الجهاز: System Info ← Device Info ← Serial Number' },
  { key: 'enabled', label: 'الجهاز مفعّل', type: 'switch' },
];

export function DevicesSection({ canWrite }: { canWrite: boolean }) {
  const [busy, setBusy] = useState<{ id: string; op: 'test' | 'pull' | 'import' } | null>(null);
  const [testResult, setTestResult] = useState<(TestResult & { name: string }) | null>(null);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const run = async <T,>(row: DeviceRow, op: 'test' | 'pull' | 'import', path: string, done: (r: T) => void, fallback: string) => {
    setBusy({ id: row.id, op });
    try {
      done(await api<T>(`/api/devices/${row.id}/${path}`, { method: 'POST' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(null);
      window.dispatchEvent(new Event('hrhub:refresh'));
    }
  };
  const isBusy = (r: DeviceRow, op: string) => busy?.id === r.id && busy.op === op;

  const actions = (r: DeviceRow) => {
    const k = kindOf(r);
    const btn = (op: 'test' | 'pull' | 'import', label: string, Icon: React.ComponentType<{ className?: string }>, onClick: () => void, cls = '') => (
      <Button variant="outline" size="sm" className={`h-7 gap-1 px-2 text-xs ${cls}`} disabled={!!busy}
        onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <Icon className={`h-3.5 w-3.5 ${isBusy(r, op) ? 'animate-pulse' : ''}`} /> {isBusy(r, op) ? 'جارٍ...' : label}
      </Button>
    );
    return (
      <div className="flex flex-wrap gap-1">
        {btn('test', k === 'zk-push' ? 'طريقة الضبط' : 'اختبار', PlugZap, () => run<TestResult>(r, 'test', 'test', (res) => setTestResult({ ...res, name: r.name }), 'فشل الاختبار'))}
        {btn('pull', k === 'zk-push' ? 'طلب كل البصمات والصور' : 'سحب البصمات', Fingerprint, () => run<PullResult>(r, 'pull', 'pull', (res) => { if (k === 'zk-push') toast.success(res.message, { duration: 10000 }); else { setPullResult(res); toast.success(res.message); } }, 'فشل السحب من الجهاز'), 'text-emerald-700')}
        {btn('import', 'استيراد الموظفين', UserPlus, () => run<ImportResult>(r, 'import', 'import-users', (res) => { setImportResult(res); toast.success(res.message); }, 'فشل استيراد الموظفين'), 'text-teal-700')}
      </div>
    );
  };

  return (
    <>
      <CrudPanel<DeviceRow>
        entityPath="/api/devices"
        entityLabel="جهاز"
        title="أجهزة البصمة"
        subtitle="أضف الجهاز، ثم «اختبار»، ثم «استيراد الموظفين»، ثم «سحب البصمات». بعدها يتم السحب تلقائيًا كل 5 دقائق."
        canWrite={canWrite}
        searchPlaceholder="بحث بالاسم أو IP أو الموقع..."
        columns={[
          { key: 'name', header: 'الجهاز', render: (r) => {
            const k = KINDS.find((x) => x.value === kindOf(r))!;
            return (
              <div className="space-y-1">
                <p className="font-medium">{r.name}{r.location ? <span className="text-xs text-muted-foreground"> · {r.location}</span> : null}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-1.5 py-0.5"><k.icon className="h-3 w-3" />{k.title}</span>
                  {kindOf(r) === 'zk-push'
                    ? <span>{r.lastIp ? `يرسل من ${r.lastIp}` : 'يرسل للبرنامج'}</span>
                    : <span className="font-mono" dir="ltr">{r.ipAddress}{r.port ? `:${r.port}` : ''}</span>}
                </p>
              </div>
            );
          } },
          { key: 'status', header: 'الحالة', render: (r) => {
            const st = STATUS[(r.enabled ? r.status : 'unknown') as keyof typeof STATUS] || STATUS.unknown;
            const t = kindOf(r) === 'zk-push' ? r.lastSeenAt : (r.lastPullAt || r.lastSeenAt);
            return (
              <div className="max-w-60 space-y-1 whitespace-normal">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}><st.icon className="h-3 w-3" />{r.enabled ? st.label : 'معطّل'}</span>
                <p className="text-[11px] text-muted-foreground">{t ? `آخر اتصال: ${fmtDateTime(t)}` : 'لم يتصل بعد'}</p>
                {r.status === 'offline' && r.lastError && <p className="text-[11px] leading-snug text-red-700">{r.lastError}</p>}
              </div>
            );
          } },
          { key: 'logs', header: 'البصمات', render: (r) => <span className="tabular font-medium">{(r._count?.attendanceLogs ?? 0).toLocaleString('en')}</span> },
          { key: '__ops', header: 'عمليات الجهاز', render: (r) => canWrite ? actions(r) : null },
        ]}
        fields={FIELDS}
        defaultValues={{ kind: 'zk-local', enabled: true, useHttps: false }}
        rowToForm={(r) => ({ ...r, kind: kindOf(r), commKey: r.commKey || '' })}
        detailsExtra={(r) => canWrite ? <div className="rounded-lg border bg-muted/30 p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">عمليات الجهاز</p>{actions(r)}</div> : null}
      />

      {/* خطوات الربط */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.value} className="rounded-lg border bg-card p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-bold"><k.icon className="h-4 w-4 text-emerald-700" />{k.title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{k.desc}</p>
          </div>
        ))}
      </div>

      {/* نتيجة الاختبار */}
      <Dialog open={!!testResult} onOpenChange={(o) => !o && setTestResult(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{testResult?.kind === 'zk-push' ? 'ضبط الجهاز ليرسل للبرنامج' : 'اختبار الاتصال'} — {testResult?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className={`flex items-start gap-2 rounded-lg border p-3 ${testResult?.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {testResult?.ok ? <Wifi className="mt-0.5 h-4 w-4 shrink-0" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="font-medium">{testResult?.message}</span>
            </div>
            {testResult?.info && (
              <div className="grid grid-cols-2 gap-2">
                {([['الموديل', testResult.info.model], ['الرقم التسلسلي', testResult.info.sn], ['موظفون على الجهاز', testResult.info.users],
                  ['بصمات على الجهاز', testResult.info.logs?.toLocaleString('en')], ['السعة', testResult.info.capacity?.toLocaleString('en')], ['طريقة الاتصال', testResult.info.protocol]] as [string, unknown][])
                  .filter(([, v]) => v !== undefined && v !== null && v !== '')
                  .map(([k, v]) => <div key={k} className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">{k}</p><p className="font-bold tabular">{String(v)}</p></div>)}
              </div>
            )}
            {!testResult?.ok && testResult?.kind !== 'zk-push' && (
              <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
                <li>تأكد إن الجهاز شغال ومتوصل بكابل الشبكة.</li>
                <li>تأكد إن الـ IP مكتوب صح (من قائمة الجهاز: Comm ← Ethernet).</li>
                <li>الكمبيوتر والجهاز لازم يكونوا على نفس الشبكة.</li>
              </ul>
            )}
            {testResult?.admsGuide && (
              <ol className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                {testResult.admsGuide.map((s, i) => <li key={i} className="flex gap-2"><span className="font-bold text-emerald-700">{i + 1}.</span><span dir="auto">{s}</span></li>)}
              </ol>
            )}
          </div>
          <DialogFooter><Button onClick={() => setTestResult(null)}>تم</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نتيجة السحب */}
      <Dialog open={!!pullResult} onOpenChange={(o) => !o && setPullResult(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>نتيجة سحب البصمات</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-900">{pullResult?.message}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['على الجهاز', pullResult?.totalOnDevice], ['جديدة', pullResult?.inserted], ['موجودة مسبقًا', pullResult?.duplicates], ['صور', pullResult?.photos ?? 0]] as [string, number | undefined][])
                .map(([k, v]) => <div key={k} className="rounded-lg border p-2.5 text-center"><p className="text-xs text-muted-foreground">{k}</p><p className="font-bold tabular">{(v ?? 0).toLocaleString('en')}</p></div>)}
            </div>
            <p className="text-xs text-muted-foreground">إعادة السحب لا تكرر أي بصمة. البصمات بأرقام غير مسجلة تظهر في «سجل البصمات الخام» — اضغط «استيراد الموظفين» لربطها.</p>
          </div>
          <DialogFooter><Button onClick={() => setPullResult(null)}>تم</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نتيجة استيراد الموظفين */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>استيراد الموظفين من الجهاز</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">{importResult?.message}</p>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {([['على الجهاز', importResult?.onDevice], ['أضيفوا', importResult?.created], ['موجودون', importResult?.existing], ['بصمات رُبطت', importResult?.linkedPunches]] as [string, number | undefined][])
                .map(([k, v]) => <div key={k} className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">{k}</p><p className="font-bold tabular">{(v ?? 0).toLocaleString('en')}</p></div>)}
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
