'use client';

import { useState } from 'react';
import { api, setToken } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, Fingerprint, ShieldCheck, User, LockKeyhole, Eye, EyeOff,
  LogIn, CalendarCheck2, Banknote, FileBarChart2, MapPin, BadgeCheck,
} from 'lucide-react';

/** شعار البرنامج — بصمة داخل مربع متدرّج (نفس هوية أيقونة التاب) */
export function BrandMark({ size = 'md', glow = true }: { size?: 'md' | 'lg' | 'xl'; glow?: boolean }) {
  const box = size === 'xl' ? 'h-20 w-20 rounded-3xl' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl';
  const icon = size === 'xl' ? 'h-11 w-11' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div
      className={`${box} bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-700 flex items-center justify-center shrink-0 ring-1 ring-white/25 ${
        glow ? 'shadow-lg shadow-emerald-900/30' : ''
      }`}
    >
      <Fingerprint className={`${icon} text-white`} strokeWidth={2} />
    </div>
  );
}

/** كتلة الاسم الرسمية: ADMS FOR HR MANAGMENT */
export function BrandTitle({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="leading-tight">
      <p className={`${compact ? 'text-xl' : 'text-2xl'} font-black tracking-tight ${dark ? 'text-white' : ''}`}>
        ADMS
        <span className="text-emerald-500">.</span>
      </p>
      <p
        className={`text-[10px] font-bold tracking-[0.28em] ${dark ? 'text-emerald-300/90' : 'text-emerald-700/80'}`}
      >
        FOR HR MANAGMENT
      </p>
    </div>
  );
}

const FEATURES = [
  { icon: Fingerprint, title: 'حضور بالبصمة', desc: 'أجهزة ZKTeco عبر ADMS أون لاين + استيراد محلي وUSB' },
  { icon: CalendarCheck2, title: 'ورديات وإجازات', desc: 'أتمتة كاملة للورديات والعطلات الرسمية بأيام الكويت' },
  { icon: Banknote, title: 'رواتب دقيقة', desc: 'الدينار الكويتي بثلاث خانات عشرية وكشوف جاهزة للبنك' },
  { icon: FileBarChart2, title: 'تقارير لحظية', desc: 'تأخير وغياب وإضافي مع تصدير Excel بضغطة واحدة' },
];

export function LoginScreen({ onLogin }: { onLogin: (me: unknown) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

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
      toast.error(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-bl from-emerald-50 via-white to-teal-50">
      {/* لوحة الهوية — يمين الشاشة على الديسكتوب */}
      <div className="hidden lg:flex w-[46%] xl:w-[52%] relative overflow-hidden bg-gradient-to-bl from-emerald-800 via-emerald-950 to-teal-950 flex-col justify-between p-10 xl:p-14">
        {/* زخارف ضوئية */}
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative flex items-center gap-4">
          <BrandMark size="xl" />
          <BrandTitle dark />
        </div>

        <div className="relative">
          <h2 className="text-3xl xl:text-4xl font-black text-white leading-snug">
            نظام متكامل لإدارة الموظفين
            <br />
            <span className="text-emerald-300">الحضور والرواتب</span>
          </h2>
          <p className="mt-3 text-emerald-100/70 text-sm leading-relaxed max-w-md">
            بديل عربي حديث لأنظمة البصمة — يربط أجهزة ZKTeco مباشرة ويحوّل البصمات إلى حضور ورواتب وتقارير جاهزة.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-white/[0.06] border border-white/10 p-4 backdrop-blur-sm hover:bg-white/[0.09] transition-colors"
              >
                <f.icon className="h-5 w-5 text-emerald-300 mb-2" />
                <p className="text-sm font-bold text-white">{f.title}</p>
                <p className="text-xs text-emerald-100/60 mt-1 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2 text-xs text-emerald-100/60">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5">
            <MapPin className="h-3.5 w-3.5 text-emerald-300" /> دولة الكويت
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> الدينار الكويتي (د.ك) بثلاث خانات
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> بياناتك محلية وآمنة
          </span>
        </div>
      </div>

      {/* نموذج الدخول */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* هوية مصغرة للموبايل */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <BrandMark size="lg" />
            <BrandTitle />
          </div>

          <div className="bg-white rounded-2xl shadow-2xl shadow-emerald-900/10 border border-emerald-100/80 p-8 space-y-6">
            <div className="hidden lg:flex items-center gap-3">
              <BrandMark />
              <div>
                <h1 className="text-lg font-extrabold">تسجيل الدخول</h1>
                <p className="text-xs text-muted-foreground">أدخل بياناتك للوصول إلى لوحة الإدارة</p>
              </div>
            </div>
            <div className="lg:hidden text-center">
              <h1 className="text-lg font-extrabold">تسجيل الدخول</h1>
              <p className="text-xs text-muted-foreground mt-0.5">أدخل بياناتك للوصول إلى لوحة الإدارة</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="username" className="mb-1.5 block">اسم المستخدم</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Input
                    id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin" autoComplete="username" autoFocus required
                    className="pr-9 h-11 bg-white"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password" className="mb-1.5 block">كلمة السر</Label>
                <div className="relative">
                  <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Input
                    id="password" type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password" required
                    className="pl-10 pr-9 h-11 bg-white"
                  />
                  <button
                    type="button" tabIndex={-1} aria-label="إظهار كلمة السر"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit" className="w-full h-11 text-base font-bold gap-2 bg-emerald-600 hover:bg-emerald-700"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    <LogIn className="h-4 w-4" /> تسجيل الدخول
                  </>
                )}
              </Button>
            </form>

            <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center border-t border-dashed pt-4">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              جلسة مشفرة 12 ساعة — كل عملية تُرصد في سجل التدقيق
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/70 mt-5">
            ADMS FOR HR MANAGMENT · نسخة 1.0 · صُمّم لإدارة الموارد البشرية في دولة الكويت
          </p>
        </div>
      </div>
    </div>
  );
}

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <BrandMark size="lg" />
          <BrandTitle compact />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl shadow-emerald-900/10 border border-emerald-100/80 p-8 space-y-6">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            شاشة الإعداد الأول — ستنشئ حساب المدير الأول، وسنجهّز تلقائيًا أنواع الإجازات الافتراضية ومكونات الراتب والوردية الافتراضية (08:00–17:00).
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">اسم المستخدم *</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus />
              </div>
              <div>
                <Label className="mb-1.5 block">اسمك الكامل</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مدير النظام" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">اسم الجهة</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="شركة ADMS" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">كلمة السر * (8+)</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              </div>
              <div>
                <Label className="mb-1.5 block">تأكيد كلمة السر *</Label>
                <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required minLength={8} />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء النظام'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
