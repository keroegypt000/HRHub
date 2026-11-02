'use client';

// DataTable مشترك: جدول كامل على الديسكتوب + بطاقات مكدسة على الموبايل + ترقيم صفحات
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, page, total, limit, onPage, emptyText, onRowClick, maxBodyHeight = '60vh',
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
}) {
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
                onClick={() => onRowClick?.(row)}
                className={cn('border-t transition-colors hover:bg-muted/40', onRowClick && 'cursor-pointer')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap', c.className)}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
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
            onClick={() => onRowClick?.(row)}
            className={cn('rounded-lg border p-3 space-y-1.5', onRowClick && 'cursor-pointer active:bg-muted/40')}
          >
            {columns
              .filter((c) => !c.hideOnMobile)
              .slice(0, 6)
              .map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground text-xs shrink-0">{c.header}</span>
                  <span className="text-left">{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}</span>
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
    </div>
  );
}
