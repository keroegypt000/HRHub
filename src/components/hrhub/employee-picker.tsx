'use client';

// اختيار موظف بالبحث (الاسم أو الرقم) — مناسب لعدد كبير من الموظفين
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickerEmployee { id: string; name: string; code: string; departmentId?: string | null }

export function EmployeePicker({ employees, value, onChange, allLabel = 'كل الموظفين', allowAll = true, className }: {
  employees: PickerEmployee[]; value: string; onChange: (id: string) => void;
  allLabel?: string; allowAll?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = employees.find((e) => e.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter((e) => !s || e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s)).slice(0, 200);
  }, [employees, q]);

  const pick = (id: string) => { onChange(id); setOpen(false); setQ(''); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('flex h-9 w-56 items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm', className)}>
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.name} (${selected.code})` : allLabel}
          </span>
          {selected && allowAll
            ? <X className="h-4 w-4 shrink-0 opacity-60" onClick={(e) => { e.stopPropagation(); onChange('all'); }} />
            : <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" dir="rtl">
        <div className="relative border-b">
          <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم..."
            className="h-9 w-full bg-transparent pr-8 pl-2 text-sm outline-none" />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {allowAll && (
            <button type="button" onClick={() => pick('all')} className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-muted">
              <Check className={cn('h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} /> {allLabel}
            </button>
          )}
          {list.map((e) => (
            <button key={e.id} type="button" onClick={() => pick(e.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-muted">
              <Check className={cn('h-4 w-4 shrink-0', value === e.id ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{e.name}</span>
              <span className="mr-auto text-xs text-muted-foreground tabular">{e.code}</span>
            </button>
          ))}
          {!list.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">لا يوجد موظف مطابق</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
