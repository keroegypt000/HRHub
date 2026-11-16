'use client';

// استثناء حضور يوم لموظف (الموارد البشرية): تبرير تأخير/خروج مبكر، اعتبار اليوم حضورًا، إضافة بصمة منسية
import { useEffect, useState } from 'react';
import { api, fmtTime } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/hrhub/common';
import { toast } from 'sonner';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';

interface Props {
  employeeId: string; employeeName: string; date: string; // YYYY-MM-DD
  onClose: () => void; onSaved: () => void;
}
interface DayInfo {
  exception: { excuseLate: boolean; excuseEarly: boolean; markPresent: boolean; reason: string } | null;
  logs: { id: string; punchTime: string; status: number; source: string }[];
  day: { status: string; lateMinutes: number; earlyMinutes: number; workedMinutes: number; firstIn: string | null; lastOut: string | null; note: string | null; shift: { name: string; startTime: string; endTime: string } | null } | null;
}

export function AttendanceExceptionDialog({ employeeId, employeeName, date, onClose, onSaved }: Props) {
  const [info, setInfo] = useState<DayInfo | null>(null);
  const [excuseLate, setExcuseLate] = useState(false);
  const [excuseEarly, setExcuseEarly] = useState(false);
  const [markPresent, setMarkPresent] = useState(false);
  const [reason, setReason] = useState('');
  const [punches, setPunches] = useState<{ time: string; status: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<DayInfo>(`/api/attendance-exceptions?employeeId=${employeeId}&date=${date}`)
      .then((d) => {
        setInfo(d);
        if (d.exception) {
          setExcuseLate(d.exception.excuseLate); setExcuseEarly(d.exception.excuseEarly);
          setMarkPresent(d.exception.markPresent); setReason(d.exception.reason);
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'فشل التحميل'));
  }, [employeeId, date]);

  const save = async () => {
    if (!reason.trim()) { toast.error('اكتب سبب الاستثناء'); return; }
    if (!excuseLate && !excuseEarly && !markPresent && !punches.some((p) => p.time)) { toast.error('اختر نوع الاستثناء أو أضف بصمة'); return; }
    setSaving(true);
    try {
      await api('/api/attendance-exceptions', {
        method: 'POST',
        body: JSON.stringify({ employeeId, date, excuseLate, excuseEarly, markPresent, reason, punches: punches.filter((p) => p.time) }),
      });
      toast.success('تم حفظ الاستثناء وإعادة حساب اليوم');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/api/attendance-exceptions?employeeId=${employeeId}&date=${date}`, { method: 'DELETE' });
      toast.success('أُلغي الاستثناء وأُعيد حساب اليوم');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل العملية');
    }
  };

  const d = info?.day;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>استثناء حضور — {employeeName} ({date})</DialogTitle></DialogHeader>
        {!info ? <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</p> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">الحالة</p>{d ? <StatusBadge status={d.status} /> : '—'}</div>
              <div><p className="text-xs text-muted-foreground">دخول / خروج</p><p className="tabular font-medium">{d?.firstIn ? fmtTime(d.firstIn) : '—'} / {d?.lastOut ? fmtTime(d.lastOut) : '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">تأخير</p><p className="tabular font-medium">{d?.lateMinutes ? `${d.lateMinutes}د` : '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">خروج مبكر</p><p className="tabular font-medium">{d?.earlyMinutes ? `${d.earlyMinutes}د` : '—'}</p></div>
            </div>
            {d?.shift && <p className="text-xs text-muted-foreground">الوردية: {d.shift.name} ({d.shift.startTime} — {d.shift.endTime})</p>}
            {info.logs.length > 0 && (
              <p className="text-xs text-muted-foreground">بصمات اليوم: {info.logs.map((l) => `${fmtTime(l.punchTime)}${l.source === 'manual' ? ' (يدوي)' : ''}`).join('، ')}</p>
            )}

            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-semibold">نوع الاستثناء</p>
              <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={excuseLate} onCheckedChange={(v) => setExcuseLate(!!v)} /> تبرير التأخير (لا يُخصم)</label>
              <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={excuseEarly} onCheckedChange={(v) => setExcuseEarly(!!v)} /> تبرير الخروج المبكر (لا يُخصم)</label>
              <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={markPresent} onCheckedChange={(v) => setMarkPresent(!!v)} /> اعتباره حاضرًا اليوم (مأمورية / نسي البصمة)</label>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">إضافة بصمة منسية</p>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setPunches((p) => [...p, { time: '', status: p.length % 2 }])}>
                  <Plus className="h-3.5 w-3.5" /> بصمة
                </Button>
              </div>
              {punches.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="time" value={p.time} dir="ltr" className="w-32" onChange={(e) => setPunches((arr) => arr.map((x, k) => k === i ? { ...x, time: e.target.value } : x))} />
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={p.status}
                    onChange={(e) => setPunches((arr) => arr.map((x, k) => k === i ? { ...x, status: Number(e.target.value) } : x))}>
                    <option value={0}>دخول</option><option value={1}>خروج</option>
                  </select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setPunches((arr) => arr.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              {!punches.length && <p className="text-xs text-muted-foreground">لو الموظف نسي يبصم دخول أو خروج، أضف الوقت هنا.</p>}
            </div>

            <div>
              <Label className="mb-1.5 block">السبب <span className="text-red-500">*</span></Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: مأمورية عمل خارجية بموافقة المدير" />
              <p className="mt-1 text-xs text-muted-foreground">يظهر السبب في كشف الحضور ويُسجَّل باسمك في سجل التدقيق.</p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          {info?.exception && <Button variant="outline" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> إلغاء الاستثناء</Button>}
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={save} disabled={saving || !info}><ShieldCheck className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ الاستثناء'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
