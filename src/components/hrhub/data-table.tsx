'use client';

// DataTable مشترك: جدول كامل على الديسكتوب + بطاقات مكدسة على الموبايل + ترقيم صفحات
// الضغط على أي صف يفتح «عرض التفاصيل» تلقائيًا (كل الأعمدة) ما لم يُمرَّر onRowClick
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecordDetails, rowEmployeeId, DetailItem } from '@/components/hrhub/record-details';

/** أعمدة الأزرار (إجراءات) لا تُعرض كحقول بل كأزرار أسفل نافذة التفاصيل */
export function isActionColumn<T>(c: Column<T>): boolean {
  return c.key.startsWith('__') || c.key === 'actions' || c.key === 'view' || c.header === '' || c.header === 'إجراءات';
}

/** الضغط على زر/رابط/حقل داخل الصف لا يفتح التفاصيل */
function fromInteractive(e: React.MouseEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest('button, a, input, select, textarea, label, [role="checkbox"], [role="switch"], [role="combobox"], [data-no-details]');
}

export function cellValue<T>(c: Column<T>, row: T): React.ReactNode {
  return c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—');
}

/** عنوان افتراضي للتفاصيل: اسم السجل أو اسم الموظف */
function defaultTitle(row: unknown): string {
  const r = row as Record<string, unknown>;
  const emp = r.employee as { name?: string; code?: string } | null | undefined;
  if (emp?.name) return `${emp.name}${emp.code ? ` (${emp.code})` : ''}`;
  if (typeof r.name === 'string' && r.name) return r.name;
  if (typeof r.title === 'string' && r.title) return r.title;
  return 'التفاصيل';
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, page, total, limit, onPage, emptyText, onRowClick, maxBodyHeight = '60vh',
  details = true, detailsTitle, detailsExtra,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  page?: number;
  total?: number;
  limit?: number;
  onPage?: (p: number) => void;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  maxBodyHeight?: string;
  /** false = بدون نافذة تفاصيل تلقائية */
  details?: boolean;
  detailsTitle?: (row: T) => React.ReactNode;
  /** محتوى إضافي أسفل التفاصيل (بنود القسيمة مثلًا) */
  detailsExtra?: (row: T) => React.ReactNode;
}) {
  const [viewing, setViewing] = useState<T | null>(null);
  const handleClick = onRowClick ?? (details ? setViewing : undefined);
  const click = (e: React.MouseEvent, row: T) => {
    if (!handleClick || fromInteractive(e)) return;
    handleClick(row);
  };
  // الصف المعروض من أحدث بيانات (بعد تحديث الجدول)
  const current = viewing ? rows.find((r) => r.id === viewing.id) || viewing : null;
  const detailsDialog = current && (
    <RecordDetails
      open
      onClose={() => setViewing(null)}
      title={detailsTitle ? detailsTitle(current) : defaultTitle(current)}
      employeeId={rowEmployeeId(current)}
      items={columns.filter((c) => !isActionColumn(c)).map<DetailItem>((c) => ({ label: c.header, value: cellValue(c, current) }))}
      actions={columns.filter((c) => isActionColumn(c)).map((c) => <div key={c.key} className="flex flex-wrap gap-1">{cellValue(c, current)}</div>)}
    >
      {detailsExtra?.(current)}
    </RecordDetails>
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-2 text-muted-foreground">
        <Inbox className="h-10 w-10 opacity-30" />
        <p className="font-medium">{emptyText || 'لا توجد بيانات بعد'}</p>
      </div>
    );
  }
  const totalPages = page && total && limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  return (
    <div className="space-y-3">
      {/* جدول الديسكتوب */}
      <div className="hidden md:block rounded-lg border overflow-auto" style={{ maxHeight: maxBodyHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
            <tr className="text-right">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-3 py-2.5 font-semibold whitespace-nowrap', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={(e) => click(e, row)}
                className={cn('border-t transition-colors hover:bg-muted/40', handleClick && 'cursor-pointer')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap', c.className)}>
                    {cellValue(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* بطاقات الموبايل */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={(e) => click(e, row)}
            className={cn('rounded-lg border p-3 space-y-1.5', handleClick && 'cursor-pointer active:bg-muted/40')}
          >
            {columns
              .filter((c) => !c.hideOnMobile)
              .slice(0, 6)
              .map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground text-xs shrink-0">{c.header}</span>
                  <span className="text-left">{cellValue(c, row)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* ترقيم الصفحات */}
      {page && total !== undefined && limit && totalPages > 1 && onPage && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} — {total} سجل
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {detailsDialog}
    </div>
  );
}
