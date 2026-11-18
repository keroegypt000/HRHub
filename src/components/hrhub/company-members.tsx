'use client';

// موظفو الشركة: عرض المنضمين + اختيار موظفين (بحث، قسم، «بدون شركة» فقط، تحديد الكل)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, UserMinus, UserPlus, Users } from 'lucide-react';

interface Emp { id: string; name: string; code: string; companyId: string | null; company: { name: string } | null; department: { id: string; name: string } | null }
const ALL = '__all';

export function CompanyMembersDialog({ companyId, companyName, onClose, canWrite }: {
  companyId: string; companyName: string; onClose: () => void; canWrite: boolean;
}) {
  const [data, setData] = useState<{ members: Emp[]; employees: Emp[] } | null>(null);
  const [tab, setTab] = useState<'members' | 'add'>('members');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState(ALL);
  const [onlyFree, setOnlyFree] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ members: Emp[]; employees: Emp[] }>(`/api/companies/${companyId}/members`)
      .then((d) => { setData(d); if (!d.members.length) setTab('add'); })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'تعذّر التحميل'));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const depts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.employees || []) if (e.department) m.set(e.department.id, e.department.name);
    return [...m.entries()];
  }, [data]);
  const match = (e: Emp) => {
    const s = q.trim().toLowerCase();
    return (dept === ALL || e.department?.id === dept) && (!s || e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s));
  };
  const candidates = useMemo(() => (data?.employees || []).filter((e) => e.companyId !== companyId && (!onlyFree || !e.companyId) && match(e)),
    [data, q, dept, onlyFree, companyId]);
  const members = useMemo(() => (data?.members || []).filter(match),
    [data, q, dept]);

  const allPicked = candidates.length > 0 && candidates.every((e) => picked.has(e.id));
  const toggleAll = () => setPicked((p) => { const n = new Set(p); if (allPicked) candidates.forEach((e) => n.delete(e.id)); else candidates.forEach((e) => n.add(e.id)); return n; });
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    if (!picked.size) return;
    setSaving(true);
    try {
      const r = await api<{ added: number; moved: number }>(`/api/companies/${companyId}/members`, { method: 'POST', body: JSON.stringify({ employeeIds: [...picked] }) });
      toast.success(`تم ضم ${r.added} موظف إلى الشركة${r.moved ? ` — ${r.moved} نُقلوا من شركة أخرى` : ''}`);
      setPicked(new Set()); setTab('members'); load();
      window.dispatchEvent(new Event('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally { setSaving(false); }
  };
  const remove = async (e: Emp) => {
    await api(`/api/companies/${companyId}/members?employeeId=${e.id}`, { method: 'DELETE' }).catch(() => {});
    load(); window.dispatchEvent(new Event('hrhub:refresh'));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col" dir="rtl">
        <DialogHeader><DialogTitle>موظفو شركة «{companyName}»</DialogTitle></DialogHeader>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <button type="button" onClick={() => setTab('members')} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'members' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            <Users className="ml-1 inline h-4 w-4" /> موظفو الشركة ({data?.members.length ?? 0})
          </button>
          {canWrite && (
            <button type="button" onClick={() => setTab('add')} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'add' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              <UserPlus className="ml-1 inline h-4 w-4" /> إضافة موظفين
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم..." className="h-9 pr-8" />
          </div>
          <Select value={dept} onValueChange={setDept} dir="rtl">
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الأقسام</SelectItem>
              {depts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          {tab === 'add' && <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyFree} onCheckedChange={(v) => setOnlyFree(!!v)} /> بدون شركة فقط</label>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {!data ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</p> : tab === 'members' ? (
            members.length ? members.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="font-medium">{e.name}</span><span className="text-xs text-muted-foreground tabular">{e.code}</span>
                <span className="text-xs text-muted-foreground">{e.department?.name || ''}</span>
                {canWrite && <Button variant="ghost" size="sm" className="mr-auto h-7 text-red-600" onClick={() => remove(e)}><UserMinus className="h-3.5 w-3.5" /> إخراج</Button>}
              </div>
            )) : <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد موظفون في هذه الشركة — اضغط «إضافة موظفين»</p>
          ) : (
            <>
              <label className="sticky top-0 flex cursor-pointer items-center gap-2 border-b bg-muted/80 px-3 py-2 text-sm font-medium backdrop-blur">
                <Checkbox checked={allPicked} onCheckedChange={toggleAll} /> تحديد الكل ({candidates.length})
              </label>
              {candidates.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-muted/50">
                  <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                  <span>{e.name}</span><span className="text-xs text-muted-foreground tabular">{e.code}</span>
                  <span className={`mr-auto rounded-full border px-2 py-0.5 text-[11px] ${e.company ? 'border-amber-200 bg-amber-50 text-amber-800' : 'text-muted-foreground'}`}>{e.company ? `حاليًا: ${e.company.name}` : 'بدون شركة'}</span>
                </label>
              ))}
              {!candidates.length && <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد موظفون مطابقون</p>}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {tab === 'add' && canWrite && <Button onClick={save} disabled={saving || !picked.size}><UserPlus className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : `ضم ${picked.size} موظف للشركة`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
