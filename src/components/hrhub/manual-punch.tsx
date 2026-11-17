'use client';

// إدخال بصمة يدوي لموظف أو مجموعة موظفين لفترة (عند عطل جهاز البصمة أو مأمورية)
import { useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { useEmployeeDirectory } from '@/components/hrhub/table-filters';

const todayKey = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const ALL = 'all';

export function ManualPunchDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { employees, departments } = useEmployeeDirectory();
  const [dept, setDept] = useState(ALL);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [inTime, setInTime] = useState('08:00');
  const [outTime, setOutTime] = useState('16:00');
  const [reason, setReason] = useState('');
  const [skipOff, setSkipOff] = useState(true);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter((e) => (dept === ALL || e.departmentId === dept) && (!s || e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s)));
  }, [employees, dept, q]);
  const allOn = list.length > 0 && list.every((e) => picked.has(e.id));
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allOn) list.forEach((e) => n.delete(e.id)); else list.forEach((e) => n.add(e.id));
    return n;
  });
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    if (!picked.size) return toast.error('اختر موظفًا واحدًا على الأقل');
    if (!reason.trim()) return toast.error('اكتب السبب');
    setSaving(true);
    try {
      const res = await api<{ message: string }>('/api/attendance/manual-punches', {
        method: 'POST',
        body: JSON.stringify({ employeeIds: [...picked], from, to, inTime, outTime, reason, skipOffDays: skipOff }),
      });
      toast.success(res.message);
      setPicked(new Set()); setReason('');
      onDone(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>إدخال بصمة يدوي</DialogTitle>
          <DialogDescription>لموظف أو مجموعة موظفين — مثلًا عند عطل جهاز البصمة. البصمات تُسجل باسم «إدخال يدوي» والسبب يظهر في التقارير.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div><Label className="mb-1 text-xs">من تاريخ</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} dir="ltr" /></div>
          <div><Label className="mb-1 text-xs">إلى تاريخ</Label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} dir="ltr" /></div>
          <div><Label className="mb-1 text-xs">وقت الدخول</Label><Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} dir="ltr" /></div>
          <div><Label className="mb-1 text-xs">وقت الخروج</Label><Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} dir="ltr" /></div>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">اترك أحد الوقتين فارغًا لإضافة بصمة واحدة. وقت خروج قبل الدخول يُسجَّل في اليوم التالي (وردية ليلية).</p>

        <div><Label className="mb-1 text-xs">السبب *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: عطل جهاز البصمة يوم ..." /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={skipOff} onCheckedChange={setSkipOff} /> تخطي أيام الراحة والعطلات والإجازات</label>

        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center gap-2 border-b p-2">
            <Select value={dept} onValueChange={setDept} dir="rtl">
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الأقسام</SelectItem>
                {departments.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative min-w-40 flex-1">
              <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم..." className="h-8 pr-8" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={allOn} onCheckedChange={toggleAll} /> تحديد الكل ({list.length})</label>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {list.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                <span>{e.name}</span>
                <span className="mr-auto text-xs text-muted-foreground tabular">{e.code}</span>
              </label>
            ))}
            {!list.length && <p className="py-4 text-center text-xs text-muted-foreground">لا يوجد موظفون</p>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <span className="ml-auto self-center text-sm text-muted-foreground">تم اختيار {picked.size} موظف</span>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ البصمات'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
