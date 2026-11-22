'use client';

// شاشات الدخول والإعداد الأول — بالإنجليزية دائمًا (مهما كانت لغة البرنامج)
import { APP_NAME, APP_MARK, APP_TAGLINE_EN } from '@/lib/brand';
import { useState } from 'react';
import { api, setToken } from '@/lib/client';
import { tr } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, User, Lock, Eye, EyeOff, LogIn, Building2, KeyRound, Database, RefreshCw,
} from 'lucide-react';

/** رسائل السيرفر بالعربي → إنجليزي (الشاشة إنجليزية دائمًا) */
const en = (m: string) => tr(m);

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-700/25"
      style={{ width: size, height: size }}
    >
      <span className="font-black leading-none text-white" style={{ fontSize: size * 0.5 }}>{APP_MARK}</span>
    </div>
  );
}

/** Brand panel: name and one line only */
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
        <span className="text-sm font-semibold tracking-[0.2em] text-white/80">{APP_NAME}</span>
      </div>
      <div className="relative">
        <h1 className="text-6xl font-black tracking-[0.06em] text-white xl:text-7xl">{APP_NAME}</h1>
        <div className="mt-6 h-1 w-16 rounded-full bg-emerald-400" />
        <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/70">{APP_TAGLINE_EN}</p>
      </div>
      <p className="relative text-xs text-white/40">© {new Date().getFullYear()} {APP_NAME}</p>
    </div>
  );
}

/** Shared layout — always English, left-to-right */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" dir="ltr" className="min-h-screen bg-white lg:grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50/60 p-5 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  'h-12 rounded-xl border-slate-200 bg-white ps-10 text-[15px] shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30';

/** Database connection problem? */
function isDbError(m: string): boolean {
  return /قاعدة البيانات|database|P1001|P1000|P6\d{3}|P2024|db\.prisma\.io|Can't reach|Connection terminated/i.test(m);
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
      toast.success('Welcome');
      onLogin(data.user);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const m = status === 401 ? 'Incorrect username or password' : err instanceof Error ? err.message : 'Sign in failed';
      setDbAlert(isDbError(m) ? en(m) : null);
      toast.error(en(m));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="mb-8">
        <div className="mb-6 lg:hidden"><LogoMark size={48} /></div>
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1.5 text-sm text-slate-500">Welcome to {APP_NAME}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <User className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="username" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Username" autoComplete="username" autoFocus required
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="password" type={showPw ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" required
              className={`${inputCls} pe-10`}
            />
            <button
              type="button" tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}
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
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><LogIn className="h-4 w-4" /> Sign in</>)}
        </Button>
      </form>

      {dbAlert && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
          <div className="mb-1.5 flex items-center gap-2 font-bold">
            <Database className="h-4 w-4 shrink-0 text-amber-600" /> The database is not available
          </div>
          <p className="text-amber-800">{dbAlert.slice(0, 220)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={checkDb} disabled={checking}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Check again
            </button>
            {dbOk === true && <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">Connected — sign in again</span>}
            {dbOk === false && <span className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800">Still unavailable</span>}
          </div>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">© {new Date().getFullYear()} {APP_NAME}</p>
    </AuthShell>
  );
}

const setupInputCls =
  'h-11 rounded-xl border-slate-200 bg-white ps-9 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30';

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ username: '', name: '', password: '', confirm: '', companyName: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          name: form.name || 'Administrator',
          password: form.password,
          companyName: form.companyName || 'Company',
        }),
      });
      toast.success('System ready — sign in now');
      onDone();
    } catch (err) {
      toast.error(en(err instanceof Error ? err.message : 'Setup failed'));
    } finally {
      setLoading(false);
    }
  };

  const field = (id: keyof typeof form, label: string, icon: React.ComponentType<{ className?: string }>, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const Icon = icon;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`su-${id}`}>{label}</Label>
        <div className="relative">
          <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input id={`su-${id}`} value={form[id]} onChange={(e) => setForm({ ...form, [id]: e.target.value })} className={setupInputCls} {...extra} />
        </div>
      </div>
    );
  };

  return (
    <AuthShell>
      <div className="mb-7">
        <div className="mb-6 lg:hidden"><LogoMark size={48} /></div>
        <h1 className="text-2xl font-bold text-slate-900">First-time setup</h1>
        <p className="mt-1.5 text-sm text-slate-500">Create the administrator account</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {field('companyName', 'Company name', Building2, { placeholder: 'Your company' })}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('username', 'Username *', User, { required: true, autoFocus: true })}
          {field('name', 'Full name', User, { placeholder: 'Administrator' })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('password', 'Password * (8+)', KeyRound, { type: 'password', required: true, minLength: 8 })}
          {field('confirm', 'Confirm password *', KeyRound, { type: 'password', required: true, minLength: 8 })}
        </div>
        <Button
          type="submit" disabled={loading}
          className="mt-2 h-12 w-full rounded-xl bg-emerald-700 text-base font-semibold shadow-md shadow-emerald-700/20 hover:bg-emerald-800"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create system'}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} {APP_NAME}</p>
    </AuthShell>
  );
}
