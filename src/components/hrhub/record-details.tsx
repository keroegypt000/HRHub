'use client';

// نافذة «عرض التفاصيل» الموحدة: أي صف في أي جدول بالنظام يُفتح بالضغط عليه
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserRound } from 'lucide-react';

export interface DetailItem {
  label: string;
  value: React.ReactNode;
  /** عرض كامل (للملاحظات والنصوص الطويلة) */
  wide?: boolean;
}

/** فارغ؟ (لإخفاء الحقول الفارغة من العرض) */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === '—';
}

/** رقم الموظف المرتبط بالصف (employeeId أو employee.id) — لزر «ملف الموظف» */
export function rowEmployeeId(row: unknown): string | null {
  const r = row as Record<string, unknown> | null;
  if (!r) return null;
  if (typeof r.employeeId === 'string' && r.employeeId) return r.employeeId;
  const e = r.employee as { id?: string } | null | undefined;
  return e && typeof e.id === 'string' ? e.id : null;
}

/** يفتح ملف الموظف الكامل من أي شاشة */
export function openEmployeeProfile(id: string) {
  window.dispatchEvent(new CustomEvent('hrhub:open-employee', { detail: { id } }));
}

export function RecordDetails({
  open, onClose, title, items, actions, children, employeeId,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  items: DetailItem[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
  employeeId?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{title}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0 rounded-lg border bg-muted/20 px-4 py-1">
          {items.map((it, i) => (
            <div
              key={`${it.label}-${i}`}
              className={`flex items-start justify-between gap-4 border-b border-dashed py-2.5 last:border-b-0 min-w-0 ${it.wide ? 'sm:col-span-2' : ''}`}
            >
              <dt className="text-xs text-muted-foreground shrink-0 pt-0.5">{it.label}</dt>
              <dd className={`text-sm font-medium min-w-0 break-words ${it.wide ? 'text-right whitespace-pre-wrap' : 'text-left'}`}>
                {isBlank(it.value) ? <span className="text-muted-foreground">—</span> : it.value}
              </dd>
            </div>
          ))}
          {!items.length && <p className="py-4 text-sm text-muted-foreground">لا توجد بيانات</p>}
        </dl>
        {children}
        {(actions || employeeId) && (
          <div className="flex flex-wrap gap-2 justify-end border-t pt-3">
            {employeeId && (
              <Button variant="outline" size="sm" className="text-emerald-700" onClick={() => { onClose(); openEmployeeProfile(employeeId); }}>
                <UserRound className="h-4 w-4" /> ملف الموظف
              </Button>
            )}
            {actions}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
