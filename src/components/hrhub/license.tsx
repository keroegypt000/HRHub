'use client';

// الترخيص: شاشة التفعيل (عند انتهاء التجربة/الترخيص) + شريط التنبيه + بطاقة الإعدادات
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { KeyRound, Copy, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { APP_NAME } from '@/lib/brand';

export interface LicenseInfo {
  state: 'unrestricted' | 'licensed' | 'grace' | 'trial' | 'trial_ended' | 'expired' | 'wrong_machine';
  locked: boolean; machine: string; daysLeft: number | null; message: string;
  license: { id: string; customer: string; issued: string; expires: string | null; maxEmployees: number | null; maxDevices: number | null } | null;
}

export function useLicense() {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const reload = useCallback(() => api<LicenseInfo>('/api/license', { skipAuth401: true }).then(setInfo).catch(() => {}), []);
  useEffect(() => {
    reload();
    const on = () => reload();
    window.addEventListener('hrhub:license', on);
    return () => window.removeEventListener('hrhub:license', on);
  }, [reload]);
  return { info, reload };
}

function MachineCode({ code, english = false }: { code: string; english?: boolean }) {
  const copy = () => { navigator.clipboard?.writeText(code).then(() => toast.success(english ? 'Machine code copied' : 'تم نسخ رقم الجهاز')).catch(() => {}); };
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{english ? 'Machine code' : 'رقم الجهاز'}</span>
      <span className="font-mono text-lg font-bold tracking-wider" dir="ltr">{code}</span>
      <Button variant="ghost" size="sm" className="ms-auto h-7" onClick={copy}><Copy className="h-3.5 w-3.5" /> {english ? 'Copy' : 'نسخ'}</Button>
    </div>
  );
}

function ActivateForm({ onDone, english = false }: { onDone: () => void; english?: boolean }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const activate = async () => {
    setBusy(true);
    try {
      await api('/api/license', { method: 'POST', body: JSON.stringify({ key: key.trim() }), skipAuth401: true });
      toast.success(english ? 'Activated successfully' : 'تم تفعيل البرنامج بنجاح');
      setKey('');
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'تعذّر التفعيل';
      toast.error(english ? tr(m) : m);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <Textarea value={key} onChange={(e) => setKey(e.target.value)} rows={3} dir="ltr" className="font-mono text-xs" placeholder="HRHUB-..." />
      <Button onClick={activate} disabled={busy || key.trim().length < 40}><KeyRound className="h-4 w-4" /> {busy ? (english ? 'Activating...' : 'جارٍ التفعيل...') : (english ? 'Activate' : 'تفعيل')}</Button>
    </div>
  );
}

/** شاشة كاملة (بالإنجليزية دائمًا): البرنامج متوقف حتى التفعيل — البيانات محفوظة والبصمات تستمر في الوصول */
export function ActivationScreen({ info, onActivated }: { info: LicenseInfo; onActivated: () => void }) {
  return (
    <div lang="en" dir="ltr" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-600" /> Activate {APP_NAME}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{tr(info.message)}</p>
          <p className="text-sm text-muted-foreground">Send the machine code to your provider to receive a license key, then paste it below. Your data is safe and punch devices keep sending records.</p>
          <MachineCode code={info.machine} english />
          <ActivateForm onDone={onActivated} english />
        </CardContent>
      </Card>
    </div>
  );
}

/** شريط أعلى البرنامج أثناء التجربة أو السماح أو قرب الانتهاء */
export function LicenseBanner({ info, onOpenSettings }: { info: LicenseInfo | null; onOpenSettings: () => void }) {
  if (!info || info.locked) return null;
  const soon = info.state === 'licensed' && info.daysLeft !== null && info.daysLeft <= 30;
  if (!['trial', 'grace', 'wrong_machine'].includes(info.state) && !soon) return null;
  const text = info.state === 'trial' ? `نسخة تجريبية — متبقٍ ${info.daysLeft} يوم`
    : info.state === 'grace' ? `انتهى الترخيص — فترة سماح متبقٍ ${info.daysLeft} يوم`
      : info.state === 'wrong_machine' ? `الترخيص لجهاز آخر — متبقٍ ${info.daysLeft} يوم`
        : `الترخيص ينتهي خلال ${info.daysLeft} يوم`;
  return (
    <div className={cn('mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
      info.state === 'trial' || soon ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800')}>
      <Clock className="h-4 w-4" /> {text}
      <Button size="sm" variant="outline" className="mr-auto h-7" onClick={onOpenSettings}><KeyRound className="h-3.5 w-3.5" /> تفعيل</Button>
    </div>
  );
}

/** بطاقة في الإعدادات: حالة الترخيص وتفاصيله ورقم الجهاز وتغيير المفتاح */
export function LicenseCard() {
  const { info, reload } = useLicense();
  if (!info || info.state === 'unrestricted') return null;
  const l = info.license;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> ترخيص البرنامج</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className={cn('rounded-lg border p-2.5 text-sm', info.state === 'licensed' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
          {info.message}{info.daysLeft !== null && info.state !== 'licensed' ? ` — متبقٍ ${info.daysLeft} يوم` : ''}
        </p>
        {l && (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>رقم الترخيص: <b className="font-mono">{l.id}</b></p>
            <p>العميل: <b>{l.customer}</b></p>
            <p>تاريخ الإصدار: <b className="tabular">{l.issued}</b></p>
            <p>الانتهاء: <b className="tabular">{l.expires || 'دائم'}</b></p>
            <p>الحد الأقصى للموظفين: <b className="tabular">{l.maxEmployees ?? 'بلا حد'}</b></p>
            <p>الحد الأقصى لأجهزة البصمة: <b className="tabular">{l.maxDevices ?? 'بلا حد'}</b></p>
          </div>
        )}
        <MachineCode code={info.machine} />
        <div>
          <p className="mb-1.5 text-sm font-medium">{l ? 'تجديد أو تغيير الترخيص' : 'تفعيل البرنامج'}</p>
          <ActivateForm onDone={() => { reload(); window.dispatchEvent(new CustomEvent('hrhub:license')); }} />
        </div>
      </CardContent>
    </Card>
  );
}
