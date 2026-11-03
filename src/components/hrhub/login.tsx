'use client';

// ADMS FOR HR MANAGMENT — شاشات الدخول والإعداد الأول (تصميم مقسوم: هوية + نموذج)
import { useState } from 'react';
import { api, setToken } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, Fingerprint, ShieldCheck, User, Lock, Eye, EyeOff,
  LogIn, CalendarDays, Wallet, Building2, KeyRound, Database, RefreshCw,
} from 'lucide-react';

/* مربّع العلامة "A" — نفس هوية أيقونة التاب */
function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/30 ring-1 ring-white/40"
      style={{ width: size, height: size }}
    >
      <span className="font-black leading-none text-white" style={{ fontSize: size * 0.5 }}>A</span>
    </div>
  );
}

const FEATURES = [
  { icon: Fingerprint, text: 'بصمة أون لاين ADMS + محلي TCP' },
  { icon: Wallet, text: 'رواتب وكشوفات bank-ready' },
  { icon: CalendarDays, text: 'ورديات وإجازات وعطلات' },
  { icon: ShieldCheck, text: 'أدوار وصلاحيات وسجل تدقيق' },
];

/** لوحة الهوية — أول عنصر في DOM فيظهر يمين الشاشة (RTL)، وعلى الموبايل بانر مختصر أعلى النموذج */
function BrandPanel() {
  return (
    <div className="relative flex flex-col gap-8 overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-700 p-6 text-white sm:p-10 lg:min-h-screen lg:p-12 xl:p-16">
      {/* توهّجات دائرية ناعمة */}
      <div className="pointer-events-none absolute -top-28 -start-28 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 -end-24 h-[26rem] w-[26rem] rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 start-1/3 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      {/* شبكة خطوط خافتة */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(to left, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* الشريط المختصر: الشعار + الاسم — يظهر وحده على الموبايل */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-lg ring-1 ring-white/30 backdrop-blur-md">
          <span className="text-xl font-black leading-none text-white">A</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-wide text-white sm:text-base">
            ADMS FOR HR MANAGMENT
          </p>
          <p className="text-[11px] text-emerald-100/80 sm:text-xs">إدارة الموارد البشرية</p>
        </div>
      </div>

      {/* المحتوى الكامل — ديسكتوب فقط */}
      <div className="relative my-auto hidden flex-col justify-center gap-8 lg:flex">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 shadow-2xl shadow-emerald-950/30 ring-1 ring-white/25 backdrop-blur-md">
          <Fingerprint className="h-12 w-12 text-white" strokeWidth={1.75} />
        </div>

        <div>
          <h1 className="text-3xl font-black leading-tight tracking-wide text-white xl:text-4xl">
            ADMS FOR HR MANAGMENT
          </h1>
          <p className="mt-3 text-base text-emerald-100/85 xl:text-lg">
            نظام إدارة الموارد البشرية والحضور والرواتب
          </p>
        </div>

        <ul className="space-y-2.5">
          {FEATURES.map((f) => (
            <li
              key={f.text}
              className="flex items-center gap-3 rounded-xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/[0.12]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                <f.icon className="h-4.5 w-4.5 text-white" />
              </span>
              <span className="text-sm font-medium text-white/95">{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative hidden text-xs text-emerald-100/70 lg:block">ZKTeco ADMS Compatible</p>
    </div>
  );
}

/** الهيكل المشترك: لوحة هوية + منطقة النموذج */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:grid lg:grid-cols-2">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8 lg:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  'h-11 rounded-xl bg-slate-50/60 ps-9 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40';

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
      toast.success('مرحبًا بك 👋');
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-emerald-950/10 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">تسجيل الدخول</h1>
            <p className="mt-0.5 text-xs text-slate-500">أدخل بياناتك للوصول إلى لوحة الإدارة</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">اسم المستخدم</Label>
            <div className="relative">
              <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
              <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
            className="h-11 w-full gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 text-base font-bold shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 focus-visible:ring-emerald-500/40"
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
                  ✅ القاعدة متصلة الآن — سجّل دخولك من جديد
                </span>
              )}
              {dbOk === false && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800">
                  ❌ ما زالت غير متاحة — نفّذ خطوة الاستعادة أعلاه ثم أعد الفحص
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-dashed border-slate-200 pt-4 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          جلسة مشفرة 12 ساعة — كل عملية تُرصد في سجل التدقيق
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] text-slate-400">
        ADMS FOR HR MANAGMENT · نسخة 1.0 · صُمّم لإدارة الموارد البشرية في دولة الكويت
      </p>
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
          companyName: form.companyName || 'شركة ADMS',
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

        <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[13px] leading-relaxed text-emerald-900">
          شاشة الإعداد الأول — ستنشئ حساب المدير الأول، وسنجهّز تلقائيًا أنواع الإجازات الافتراضية ومكونات الراتب
          والوردية الافتراضية (08:00–17:00).
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
                placeholder="شركة ADMS" className={setupInputCls}
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

      <p className="mt-5 text-center text-[11px] text-slate-400">
        ADMS FOR HR MANAGMENT · نظام إدارة الموارد البشرية والحضور بالبصمة والرواتب
      </p>
    </AuthShell>
  );
}
