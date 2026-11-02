'use client';

import { useState } from 'react';
import { api, setToken } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Users, ShieldCheck } from 'lucide-react';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
        <Users className="h-7 w-7 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">HRHub</h1>
        <p className="text-xs text-muted-foreground">إدارة الموارد البشرية والحضور والرواتب</p>
      </div>
    </div>
  );
}

export function LoginScreen({ onLogin }: { onLogin: (me: unknown) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-emerald-100/60 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl shadow-emerald-900/5 border p-8 space-y-6">
          <Brand />
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="mb-1.5 block">اسم المستخدم</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="admin" autoComplete="username" autoFocus required />
            </div>
            <div>
              <Label htmlFor="password" className="mb-1.5 block">كلمة السر</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسجيل الدخول'}
            </Button>
          </form>
          <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
            <ShieldCheck className="h-3.5 w-3.5" />
            جلسات مشفرة 12 ساعة — سجل دخول يُرصد في التدقيق
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          دولة الكويت — الدينار الكويتي (د.ك) بثلاث خانات عشرية
        </p>
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
          companyName: form.companyName || 'شركة HRHub',
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-emerald-100/60 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl shadow-emerald-900/5 border p-8 space-y-6">
          <Brand />
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
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="شركة HRHub" />
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
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء النظام'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
