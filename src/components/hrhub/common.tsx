'use client';

// مكونات الحالة والشعارات المشتركة
import { Badge } from '@/components/ui/badge';
import { STATUS_AR, STATUS_COLORS } from '@/lib/client';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <Badge variant="outline" className={cn(color, 'whitespace-nowrap', className)}>
      {STATUS_AR[status] || status}
    </Badge>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-xl">📋</div>
      <p className="font-medium text-muted-foreground">{title}</p>
      {hint && <p className="text-sm text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
