'use client';

// شاشات الدخول والإعداد الأول (تصميم مقسوم: هوية + نموذج)
import { LanguageToggle } from '@/components/hrhub/language';
import { APP_NAME, APP_NAME_AR, APP_MARK, APP_TAGLINE } from '@/lib/brand';
import { useState } from 'react';
import { api, setToken } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, User, Lock, Eye, EyeOff, LogIn, Building2, KeyRound, Database, RefreshCw,
} from 'lucide-react';

/* علامة Ad Mas */
function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-700/25"
      style={{ width: size, height: size }}
    >
      <span className="font-black leading-none tracking-tight text-white" style={{ fontSize: size * 0.36 }}>{APP_MARK}</span>
    </div>
  );
}

/** لوحة الهوية: الاسم وسطر واحد فقط — تصميم هادئ */
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0b2b26] lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-14">
      <div className="pointer-events-none absolute -end-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -start-32 h-[30rem] w-[30rem] rounded-full bg-teal-400/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div className="relative flex items-center gap-3">
        <LogoMark size={40} />
        <span className="text-sm font-semibold tracking-wide text-white/80">{APP_NAME}</span>
      </div>
      <div className="relative">
        <h1 className="text-6xl font-black tracking-tight text-white xl:text-7xl" dir="ltr" style={{ textAlign: 'right' }}>{APP_NAME}</h1>
        <p className="mt-2 text-2xl font-semibold text-emerald-300/90">{APP_NAME_AR}</p>
        <div className="mt-6 h-1 w-16 rounded-full bg-emerald-400" />
        <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/70">{APP_TAGLINE}</p>
      </div>
      <p className="relative text-xs text-white/40" dir="ltr" style={{ textAlign: 'right' }}>© {new Date().getFullYear()} {APP_NAME}</p>
    </div>
  );
}

/** الهيكل المشترك: لوحة الهوية + منطقة النموذج */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50/60 p-5 sm:p-10">
        <LanguageToggle className="absolute top-4 end-4" />
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  'h-12 rounded-xl border-slate-200 bg-white ps-10 text-[15px] shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30';

/** هل الرسالة تشير إلى توقّف/فقدان الاتصال بقاعدة البيانات؟ */
function isDbError(m: string): boolean {
  return /قاعدة البيانات|P1001|P1000|P6\d{3}|P2024|db\.prisma\.io|Can't reach|Connection terminated/i.test(m);
}

export function LoginScreen({ onLogin }: { onLogin: (me: unknown) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbAlert, setDbAlert] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  const checkDb = async () => {
    setChecking(true);
    try {
      const h = await api<{ connected: boolean }>('/api/health?quick=1');
      setDbOk(!!h.connected);
    } catch {
      setDbOk(false);
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api<{ user: unknown; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      toast.success('مرحبًا بك');
      onLogin(data.user);
    } catch (err) {
      const m = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      setDbAlert(isDbError(m) ? m : null);
      toast.error(m);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div>
        <div className="mb-8">
          <div className="mb-6 lg:hidden"><LogoMark size={48} /></div>
          <h1 className="text-2xl font-bold text-slate-900">تسجيل الدخول</h1>
          <p className="mt-1.5 text-sm text-slate-500">مرحبًا بك في {APP_NAME}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">اسم المستخدم</Label>
            <div className="relative">
              <User className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="admin" autoComplete="username" autoFocus required
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة السر</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password" type={showPw ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" required
                className={`${inputCls} pe-10`}
              />
              <button
                type="button" tabIndex={-1} aria-label={showPw ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                onClick={() => setShowPw((v) => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit" disabled={loading}
            className="mt-2 h-12 w-full gap-2 rounded-xl bg-emerald-700 text-base font-semibold shadow-md shadow-emerald-700/20 hover:bg-emerald-800 focus-visible:ring-emerald-500/40"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <LogIn className="h-4 w-4" /> تسجيل الدخول
              </>
            )}
          </Button>
        </form>

        {dbAlert && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
            <div className="mb-1.5 flex items-center gap-2 font-extrabold">
              <Database className="h-4 w-4 shrink-0 text-amber-600" />
              قاعدة البيانات غير متاحة الآن
            </div>
            <p className="text-amber-800">{dbAlert.slice(0, 220)}</p>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-amber-900">
              <li>افتح <b>console.prisma.io</b> ← مشروعك ← اضغط <b>Restore access for 24 hours</b> (مجاني)</li>
              <li>أو رقّ إلى خطة <b>Starter</b> لاستعادة فورية وحصة أكبر</li>
              <li>أو أنشئ قاعدة جديدة وحدّث <b>DATABASE_URL</b> في Vercel ثم Redeploy</li>
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button" onClick={checkDb} disabled={checking}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
              >
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                فحص حالة قاعدة البيانات
              </button>
              {dbOk === true && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                  القاعدة متصلة الآن — سجّل دخولك من جديد
                </span>
              )}
              {dbOk === false && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800">
                  ما زالت غير متاحة — نفّذ خطوة الاستعادة أعلاه ثم أعد الفحص
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      <p className="mt-10 text-center text-xs text-slate-400" dir="ltr">© {new Date().getFullYear()} {APP_NAME}</p>
    </AuthShell>
  );
}

const setupInputCls =
  'h-10 rounded-xl bg-slate-50/60 ps-9 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40';

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ username: '', name: '', password: '', confirm: '', companyName: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('كلمتا السر غير متطابقتين');
      return;
    }
    setLoading(true);
    try {
      await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          name: form.name || 'مدير النظام',
          password: form.password,
          companyName: form.companyName || 'الشركة',
        }),
      });
      toast.success('تم تهيئة النظام — سجّل دخولك الآن');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الإعداد');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-emerald-950/10 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">الإعداد الأول</h1>
            <p className="mt-0.5 text-xs text-slate-500">إنشاء حساب المدير وتهيئة النظام</p>
          </div>
        </div>


        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="su-username">اسم المستخدم *</Label>
              <div className="relative">
                <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="su-username" value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required autoFocus className={setupInputCls}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-name">اسمك الكامل</Label>
              <div className="relative">
                <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="su-name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مدير النظام" className={setupInputCls}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="su-company">اسم الجهة</Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="su-company" value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="اسم شركتك" className={setupInputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="su-password">كلمة السر * (8+)</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="su-password" type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required minLength={8} className={setupInputCls}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-confirm">تأكيد كلمة السر *</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="su-confirm" type="password" value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required minLength={8} className={setupInputCls}
                />
              </div>
            </div>
          </div>

          <Button
            type="submit" disabled={loading}
            className="h-11 w-full rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 text-base font-bold shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 focus-visible:ring-emerald-500/40"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'إنشاء النظام'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400" dir="ltr">© {new Date().getFullYear()} {APP_NAME}</p>
    </AuthShell>
  );
}
