'use client';

// موظفو الوردية: عرض المربوطين حاليًا + اختيار موظفين جدد (بحث، قسم، تحديد الكل) + تاريخ البداية
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, UserMinus, UserPlus, Users } from 'lucide-react';

interface Emp {
  id: string; name: string; code: string; department: { id: string; name: string } | null;
  currentShift: { id: string; name: string; assignmentId: string; fromDate: string } | null;
}

const todayKey = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const ALL = '__all';

export function ShiftMembersDialog({ shiftId, shiftName, onClose, canWrite }: {
  shiftId: string; shiftName: string; onClose: () => void; canWrite: boolean;
}) {
  const [data, setData] = useState<{ members: Emp[]; employees: Emp[] } | null>(null);
  const [tab, setTab] = useState<'members' | 'add'>('members');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState(ALL);
  const [onlyFree, setOnlyFree] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState(todayKey());
  const [wholeHistory, setWholeHistory] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ members: Emp[]; employees: Emp[] }>(`/api/shifts/${shiftId}/members`)
      .then((d) => { setData(d); if (!d.members.length) setTab('add'); })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'فشل التحميل'));
  }, [shiftId]);
  useEffect(() => { load(); }, [load]);

  const depts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.employees || []) if (e.department) m.set(e.department.id, e.department.name);
    return [...m.entries()];
  }, [data]);

  // المرشحون للإضافة: غير المربوطين بهذه الوردية
  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.employees || []).filter((e) =>
      e.currentShift?.id !== shiftId &&
      (dept === ALL || e.department?.id === dept) &&
      (!onlyFree || !e.currentShift) &&
      (!s || e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s)));
  }, [data, q, dept, onlyFree, shiftId]);

  const allPicked = candidates.length > 0 && candidates.every((e) => picked.has(e.id));
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allPicked) candidates.forEach((e) => n.delete(e.id)); else candidates.forEach((e) => n.add(e.id));
    return n;
  });
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async (ids: string[] = [...picked], whole = wholeHistory) => {
    if (!ids.length) { toast.error('اختر موظفًا واحدًا على الأقل'); return; }
    setSaving(true);
    try {
      const r = await api<{ added: number; unchanged: number; moved: number }>(`/api/shifts/${shiftId}/members`, {
        method: 'POST', body: JSON.stringify({ employeeIds: ids, fromDate, wholeHistory: whole }),
      });
      toast.success(whole
        ? `تم ربط ${r.added} موظف بالوردية على كامل السجل — جارٍ إعادة احتساب الحضور في الخلفية`
        : `تم ربط ${r.added} موظف بالوردية${r.moved ? ` — ${r.moved} نُقلوا من ورديات أخرى` : ''}`);
      setPicked(new Set());
      setTab('members');
      load();
      window.dispatchEvent(new Event('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Emp) => {
    if (!e.currentShift) return;
    try {
      await api(`/api/shifts/${shiftId}/members?assignmentId=${e.currentShift.assignmentId}&date=${todayKey()}`, { method: 'DELETE' });
      toast.success(`أُخرج ${e.name} من الوردية من اليوم`);
      load();
      window.dispatchEvent(new Event('hrhub:refresh'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل العملية');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>موظفو وردية «{shiftName}»</DialogTitle></DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <button type="button" onClick={() => setTab('members')}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'members' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            <Users className="ml-1 inline h-4 w-4" /> على الوردية الآن ({data?.members.length ?? 0})
          </button>
          {canWrite && (
            <button type="button" onClick={() => setTab('add')}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'add' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              <UserPlus className="ml-1 inline h-4 w-4" /> إضافة موظفين
            </button>
          )}
        </div>

        {!data ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</p> : tab === 'members' ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            {!data.members.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد موظفون على هذه الوردية — اضغط «إضافة موظفين»</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80"><tr className="text-right">
                  <th className="p-2">الموظف</th><th className="p-2">القسم</th><th className="p-2">من تاريخ</th><th className="p-2" />
                </tr></thead>
                <tbody>
                  {data.members.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2"><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground tabular">{e.code}</p></td>
                      <td className="p-2 text-muted-foreground">{e.department?.name || '—'}</td>
                      <td className="p-2 tabular text-xs">{e.currentShift ? fmtDate(e.currentShift.fromDate) : '—'}</td>
                      <td className="p-2 text-left">
                        {canWrite && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-600" onClick={() => remove(e)}>
                            <UserMinus className="h-3.5 w-3.5" /> إخراج
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم الوظيفي..." className="pr-9" />
              </div>
              <Select value={dept} onValueChange={setDept} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الأقسام</SelectItem>
                  {depts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 font-medium">
                <Checkbox checked={allPicked} onCheckedChange={toggleAll} /> تحديد الكل ({candidates.length})
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <Checkbox checked={onlyFree} onCheckedChange={(v) => setOnlyFree(!!v)} /> بدون وردية فقط
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {!candidates.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد موظفون مطابقون</p>
              ) : candidates.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
                  <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.name} <span className="text-xs text-muted-foreground tabular">· {e.code}</span></p>
                    <p className="text-xs text-muted-foreground">{e.department?.name || 'بدون قسم'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${e.currentShift ? 'border-amber-200 bg-amber-50 text-amber-800' : 'text-muted-foreground'}`}>
                    {e.currentShift ? `حاليًا: ${e.currentShift.name}` : 'بدون وردية'}
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="radio" className="mt-1" checked={wholeHistory} onChange={() => setWholeHistory(true)} />
                <span><b>على كل السجل السابق</b> — تحل هذه الوردية محل أي وردية سابقة للموظف من أول بصمة له، ويُعاد احتساب حضوره بالكامل عليها.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="radio" className="mt-1" checked={!wholeHistory} onChange={() => setWholeHistory(false)} />
                <span><b>من تاريخ معين</b> — يُنقل الموظف إلى هذه الوردية من التاريخ المحدد، ويبقى حضوره السابق على ورديته القديمة.</span>
              </label>
              {!wholeHistory && (
                <div className="mr-6">
                  <Label className="mb-1 block text-xs">تبدأ الوردية من</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44" dir="ltr" />
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {tab === 'members' && canWrite && !!data?.members.length && (
            <Button variant="outline" className="text-emerald-700 border-emerald-300" disabled={saving}
              onClick={() => { if (confirm(`تطبيق هذه الوردية على كامل السجل السابق لـ ${data.members.length} موظف؟ ستُلغى ورديّاتهم السابقة ويُعاد احتساب حضورهم بالكامل عليها.`)) save(data.members.map((m) => m.id), true); }}>
              تطبيق على كل السجل السابق ({data.members.length})
            </Button>
          )}
          {tab === 'add' && canWrite && (
            <Button onClick={() => save()} disabled={saving || !picked.size}>
              <UserPlus className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : `ربط ${picked.size} موظف بالوردية`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
