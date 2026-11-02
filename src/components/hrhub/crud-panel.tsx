'use client';

// لوحة CRUD عامة: نموذج Dialog مبني على تعريف الحقول — تخدم 9 أقسام موحدة
import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, Column } from '@/components/hrhub/data-table';
import { PageHeader } from '@/components/hrhub/common';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Download, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'switch' | 'textarea' | 'time';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[]; // ثابتة أو من loader
  hint?: string;
  span?: 1 | 2;
}

export interface CrudPanelProps<T extends { id: string }> {
  entityPath: string; // مسار API
  entityLabel: string; // عربي
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  fields: FieldDef[];
  canWrite: boolean;
  extraActions?: React.ReactNode;
  defaultValues?: Record<string, unknown>;
  /** تحميل خيارات select ديناميكية (أقسام، ورديات...) */
  loadOptions?: () => Promise<Record<string, { value: string; label: string }[]>>;
  rowToForm?: (row: T) => Record<string, unknown>;
  filtersBar?: React.ReactNode;
  searchPlaceholder?: string;
  /** إجراءات إضافية لكل صف (تجديد، اعتماد...) */
  rowActions?: (row: T) => React.ReactNode;
}

export function CrudPanel<T extends { id: string }>({
  entityPath, entityLabel, title, subtitle, columns, fields, canWrite,
  extraActions, defaultValues = {}, loadOptions, rowToForm, filtersBar, searchPlaceholder, rowActions,
}: CrudPanelProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [options, setOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const data = await api<{ rows: T[] }>(`${entityPath}?${params}`);
      setRows(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [entityPath, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // إعادة تحميل عند طلب أي قسم (بعد تجديد عقد مثلاً)
    const onRefresh = () => load();
    window.addEventListener('hrhub:refresh', onRefresh);
    return () => window.removeEventListener('hrhub:refresh', onRefresh);
  }, [load]);
  useEffect(() => {
    if (loadOptions) loadOptions().then(setOptions).catch(() => {});
  }, [loadOptions]);

  const openCreate = () => {
    setEditing(null);
    const init: Record<string, unknown> = { ...defaultValues };
    for (const f of fields) if (init[f.key] === undefined && f.type === 'switch') init[f.key] = true;
    setForm(init);
    setDialogOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    const base = rowToForm ? rowToForm(row) : (row as unknown as Record<string, unknown>);
    setForm({ ...base });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = form[f.key];
        if (f.type === 'date' && (v === '' || v === null)) payload[f.key] = null;
        else payload[f.key] = v;
      }
      if (editing) {
        await api(`${entityPath}/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success(`تم تعديل ${entityLabel}`);
      } else {
        await api(entityPath, { method: 'POST', body: JSON.stringify(payload) });
        toast.success(`تم إنشاء ${entityLabel}`);
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api(`${entityPath}/${deleting.id}`, { method: 'DELETE' });
      toast.success(`تم حذف ${entityLabel}`);
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحذف');
      setDeleting(null);
    }
  };

  const setVal = (key: string, v: unknown) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {extraActions}
            <Button variant="outline" size="sm" onClick={() => load()}>
              <Search className="h-4 w-4 md:hidden" /> تحديث
            </Button>
            {canWrite && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> إضافة {entityLabel}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder || 'بحث...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        {filtersBar}
      </div>

      <DataTable
        columns={canWrite ? [
          ...columns,
          {
            key: '__actions',
            header: 'إجراءات',
            render: (row) => (
              <div className="flex gap-1 items-center">
                {rowActions?.(row)}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ] : [
          ...columns,
          ...(rowActions ? [{ key: '__actions', header: 'إجراءات', render: (row: T) => <div className="flex gap-1">{rowActions(row)}</div> } as Column<T>] : []),
        ]}
        rows={rows}
        loading={loading}
      />

      {/* حوار الإضافة/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? `تعديل ${entityLabel}` : `إضافة ${entityLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {fields.map((f) => (
              <div key={f.key} className={f.span === 2 ? 'sm:col-span-2' : ''}>
                <Label className="mb-1.5 block">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </Label>
                {f.type === 'select' ? (
                  <Select
                    value={String(form[f.key] ?? '')}
                    onValueChange={(v) => setVal(f.key, v)}
                  >
                    <SelectTrigger dir="rtl"><SelectValue placeholder={`اختر ${f.label}`} /></SelectTrigger>
                    <SelectContent>
                      {(f.options || options[f.key] || []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === 'switch' ? (
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!!form[f.key]} onCheckedChange={(v) => setVal(f.key, v)} />
                    <span className="text-sm text-muted-foreground">{form[f.key] ? 'نعم' : 'لا'}</span>
                  </div>
                ) : f.type === 'textarea' ? (
                  <Textarea
                    value={String(form[f.key] ?? '')}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    rows={3}
                  />
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
                    step={f.type === 'number' ? 'any' : undefined}
                    value={String(form[f.key] ?? '')}
                    onChange={(e) => setVal(f.key, e.target.value)}
                  />
                )}
                {f.hint && <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع، وستُسجل العملية في سجل التدقيق مع إنشاء نقطة استعادة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={doDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// مساعد لتحميل خيارات الأقسام والمسميات والورديات
export const optionLoaders = {
  departments: () =>
    api<{ rows: { id: string; name: string }[] }>('/api/departments?limit=500')
      .then((d) => ({ departmentId: d.rows.map((r) => ({ value: r.id, label: r.name })) })),
  positions: () =>
    api<{ rows: { id: string; name: string }[] }>('/api/positions?limit=500')
      .then((d) => ({ positionId: d.rows.map((r) => ({ value: r.id, label: r.name })) })),
  shifts: () =>
    api<{ rows: { id: string; name: string; startTime: string; endTime: string }[] }>('/api/shifts?limit=500')
      .then((d) => ({ shiftId: d.rows.map((r) => ({ value: r.id, label: `${r.name} (${r.startTime}-${r.endTime})` })) })),
  leaveTypes: () =>
    api<{ rows: { id: string; name: string }[] }>('/api/leave-types?limit=100')
      .then((d) => ({ leaveTypeId: d.rows.map((r) => ({ value: r.id, label: r.name })) })),
  employees: () =>
    api<{ rows: { id: string; name: string; code: string }[] }>('/api/employees?limit=2000')
      .then((d) => ({ employeeId: d.rows.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` })) })),
  devices: () =>
    api<{ rows: { id: string; sn: string; name: string }[] }>('/api/devices?limit=200')
      .then((d) => ({ deviceId: d.rows.map((r) => ({ value: r.sn, label: r.name })) })),
  combine: (...loaders: (() => Promise<Record<string, { value: string; label: string }[]>>)[]) =>
    async () => {
      const results = await Promise.all(loaders.map((l) => l()));
      return Object.assign({}, ...results);
    },
};

export { fmtDate };
export { Download };
