'use client';

// محرر صلاحيات المستخدم: لكل شاشة (مخفية / عرض فقط / عرض وتعديل) — مع قوالب جاهزة حسب الدور
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { SCREENS, SCREEN_GROUPS, LEVEL_AR, type ScreenLevel } from '@/lib/screens';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { EyeOff, Eye, Pencil, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserLite { id: string; name: string; username: string; role: string; permissions?: string | null }
const LEVELS: { v: ScreenLevel; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { v: 'none', icon: EyeOff, tone: 'bg-slate-600 text-white border-slate-600' },
  { v: 'view', icon: Eye, tone: 'bg-sky-600 text-white border-sky-600' },
  { v: 'edit', icon: Pencil, tone: 'bg-emerald-600 text-white border-emerald-600' },
];

function parse(json?: string | null): Record<string, unknown> {
  try { const v = json ? JSON.parse(json) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** ملخص صلاحيات المستخدم في جدول المستخدمين */
export function permissionsSummary(json?: string | null): string {
  const sc = parse(json).screens as Record<string, string> | undefined;
  if (!sc || !Object.keys(sc).length) return 'حسب الدور';
  return `مخصصة (${Object.keys(sc).length} شاشة معدّلة)`;
}

export function PermissionsDialog({ user, onClose, onSaved }: { user: UserLite; onClose: () => void; onSaved: () => void }) {
  const [defaults, setDefaults] = useState<Record<string, Record<string, ScreenLevel>>>({});
  const [roles, setRoles] = useState<Record<string, string>>({});
  const base = useMemo(() => parse(user.permissions), [user.permissions]);
  const [levels, setLevels] = useState<Record<string, ScreenLevel>>(() => ({ ...((base.screens as Record<string, ScreenLevel>) || {}) }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ roles: Record<string, string>; defaults: Record<string, Record<string, ScreenLevel>> }>('/api/users/role-screens')
      .then((d) => { setDefaults(d.defaults); setRoles(d.roles); }).catch(() => {});
  }, []);

  const roleDef = defaults[user.role] || {};
  const effective = (key: string): ScreenLevel => levels[key] || roleDef[key] || 'none';
  const set = (key: string, v: ScreenLevel) => setLevels((l) => ({ ...l, [key]: v }));
  const applyPreset = (role: string) => {
    const d = defaults[role] || {};
    setLevels(Object.fromEntries(SCREENS.filter((s) => !s.adminOnly).map((s) => [s.key, d[s.key] || 'none'])));
  };
  const setAll = (v: ScreenLevel) => setLevels(Object.fromEntries(SCREENS.filter((s) => !s.adminOnly).map((s) => [s.key, v])));
  const setGroup = (group: string, v: ScreenLevel) => setLevels((l) => ({ ...l, ...Object.fromEntries(SCREENS.filter((s) => s.group === group && !s.adminOnly).map((s) => [s.key, v])) }));
  const visibleCount = SCREENS.filter((s) => !s.adminOnly && effective(s.key) !== 'none').length;

  const save = async () => {
    setSaving(true);
    try {
      // نحفظ فقط ما يختلف عن الدور — لو كله مطابق نرجع «حسب الدور»
      const diff = Object.fromEntries(SCREENS.filter((s) => !s.adminOnly && levels[s.key] && levels[s.key] !== roleDef[s.key]).map((s) => [s.key, levels[s.key]]));
      const next: Record<string, unknown> = { ...base };
      if (Object.keys(diff).length) next.screens = diff; else delete next.screens;
      await api(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ permissions: Object.keys(next).length ? JSON.stringify(next) : null }) });
      toast.success(`تم حفظ صلاحيات ${user.name || user.username} — تُطبَّق عند تحديث صفحته أو دخوله التالي`);
      onSaved(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally { setSaving(false); }
  };

  if (user.role === 'admin') {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl"><DialogHeader><DialogTitle>صلاحيات {user.name || user.username}</DialogTitle>
          <DialogDescription>مدير النظام يرى كل الشاشات ويعدّل كل شيء دائمًا. لتقييد مستخدم غيّر دوره أولًا.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق</Button></DialogFooter></DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle>صلاحيات {user.name || user.username}</DialogTitle>
          <DialogDescription>حدد لكل شاشة: مخفية، أو عرض فقط، أو عرض وتعديل. الدور الحالي: {roles[user.role] || user.role}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
          <span className="text-muted-foreground">قالب جاهز:</span>
          <Select onValueChange={applyPreset} dir="rtl">
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="نسخ صلاحيات دور" /></SelectTrigger>
            <SelectContent>{Object.entries(roles).filter(([k]) => k !== 'admin' && k !== 'employee').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAll('view')}><Eye className="h-3.5 w-3.5" /> الكل عرض فقط</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAll('none')}><EyeOff className="h-3.5 w-3.5" /> إخفاء الكل</Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setLevels({})}><RotateCcw className="h-3.5 w-3.5" /> حسب الدور</Button>
          <span className="mr-auto text-xs text-muted-foreground">{visibleCount} شاشة ظاهرة</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pl-1">
          {SCREEN_GROUPS.map((g) => {
            const items = SCREENS.filter((s) => s.group === g && !s.adminOnly);
            if (!items.length) return null;
            return (
              <div key={g} className="rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                  <b className="text-sm">{g}</b>
                  <span className="mr-auto flex gap-1">
                    {LEVELS.map((l) => <button key={l.v} type="button" onClick={() => setGroup(g, l.v)} className="rounded border px-2 py-0.5 text-[11px] hover:bg-background">{LEVEL_AR[l.v]} للكل</button>)}
                  </span>
                </div>
                {items.map((s) => {
                  const cur = effective(s.key);
                  const custom = levels[s.key] && levels[s.key] !== roleDef[s.key];
                  return (
                    <div key={s.key} className="flex items-center gap-2 border-b px-3 py-1.5 last:border-0">
                      <span className="text-sm">{s.label}</span>
                      {custom && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">مخصص</span>}
                      <div className="mr-auto flex overflow-hidden rounded-md border">
                        {LEVELS.map((l) => (
                          <button key={l.v} type="button" onClick={() => set(s.key, l.v)}
                            className={cn('flex items-center gap-1 border-l px-2.5 py-1 text-xs first:border-l-0', cur === l.v ? l.tone : 'bg-background text-muted-foreground hover:bg-muted')}>
                            <l.icon className="h-3.5 w-3.5" /> {LEVEL_AR[l.v]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">الإعدادات والمستخدمون وسجل التدقيق متاحة لمدير النظام فقط.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
