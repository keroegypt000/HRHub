'use client';

// صفحات مستقلة للجوازات والإقامات — نفس لوحة CRUD المستخدمة في التنبيهات
import { api, fmtDate } from '@/lib/client';
import { CrudPanel, optionLoaders } from '@/components/hrhub/crud-panel';
import { PageHeader } from '@/components/hrhub/common';
import { ExpiryBadge } from '@/components/hrhub/sections/alerts';

type Row = Record<string, unknown> & { id: string };

export function PassportsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <div>
      <PageHeader
        title="الجوازات"
        subtitle="سجل جوازات الموظفين وأسرهم — تنبيه تلقائي قبل انتهاء النفاذ بـ30/60/90 يومًا"
      />
      <CrudPanel<Row>
        entityPath="/api/passports"
        entityLabel="جواز"
        title="جوازات السفر"
        subtitle="الأقرب انتهاءً يظهر أولًا — راجع تبويب التنبيهات للقائمة المجمعة"
        canWrite={canWrite}
        searchPlaceholder="بحث برقم الجواز أو الاسم..."
        columns={[
          { key: 'holder', header: 'صاحب الجواز', render: (r) => <span className="font-medium">{String(r.holderName)}</span> },
          { key: 'passportNo', header: 'رقم الجواز', render: (r) => <span className="font-mono">{String(r.passportNo)}</span> },
          { key: 'employee', header: 'موظف مرتبط', render: (r) => (r.employee as { name: string; code: string } | null) ? `${(r.employee as { name: string; code: string }).name}` : '—', hideOnMobile: true },
          { key: 'nationality', header: 'الجنسية', render: (r) => String(r.nationality || '—'), hideOnMobile: true },
          { key: 'expiry', header: 'تاريخ الانتهاء', render: (r) => <span className="tabular">{fmtDate(r.expiryDate as string)}</span> },
          { key: 'status', header: 'الحالة', render: (r) => <ExpiryBadge expiry={r.expiryDate as string} /> },
        ]}
        fields={[
          { key: 'holderName', label: 'اسم صاحب الجواز', type: 'text', required: true },
          { key: 'employeeId', label: 'موظف مرتبط (اختياري)', type: 'select' },
          { key: 'passportNo', label: 'رقم الجواز', type: 'text', required: true },
          { key: 'nationality', label: 'الجنسية', type: 'text' },
          { key: 'issueDate', label: 'تاريخ الإصدار', type: 'date' },
          { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{}}
        loadOptions={optionLoaders.employees}
        rowToForm={(r) => ({
          ...r,
          issueDate: r.issueDate ? fmtDate(r.issueDate as string) : '',
          expiryDate: r.expiryDate ? fmtDate(r.expiryDate as string) : '',
          employeeId: (r.employee as { id: string } | null | undefined)?.id || '',
        })}
      />
    </div>
  );
}

export function IqamasSection({ canWrite }: { canWrite: boolean }) {
  return (
    <div>
      <PageHeader
        title="الإقامات"
        subtitle="سجل إقامات المقيمين ومدة سريانها — تنبيه تلقائي قبل النفاذ لتجديد في وقته"
      />
      <CrudPanel<Row>
        entityPath="/api/iqamas"
        entityLabel="إقامة"
        title="الإقامات"
        subtitle="الأقرب انتهاءً يظهر أولًا — راجع تبويب التنبيهات للقائمة المجمعة"
        canWrite={canWrite}
        searchPlaceholder="بحث برقم الإقامة أو الاسم أو الكفيل..."
        columns={[
          { key: 'holder', header: 'صاحب الإقامة', render: (r) => <span className="font-medium">{String(r.holderName)}</span> },
          { key: 'iqamaNo', header: 'رقم الإقامة', render: (r) => <span className="font-mono">{String(r.iqamaNo)}</span> },
          { key: 'employee', header: 'موظف مرتبط', render: (r) => (r.employee as { name: string; code: string } | null) ? `${(r.employee as { name: string; code: string }).name}` : '—', hideOnMobile: true },
          { key: 'profession', header: 'المهنة', render: (r) => String(r.profession || '—'), hideOnMobile: true },
          { key: 'sponsor', header: 'الكفيل', render: (r) => String(r.sponsor || '—'), hideOnMobile: true },
          { key: 'expiry', header: 'تاريخ الانتهاء', render: (r) => <span className="tabular">{fmtDate(r.expiryDate as string)}</span> },
          { key: 'status', header: 'الحالة', render: (r) => <ExpiryBadge expiry={r.expiryDate as string} /> },
        ]}
        fields={[
          { key: 'holderName', label: 'اسم صاحب الإقامة', type: 'text', required: true },
          { key: 'employeeId', label: 'موظف مرتبط (اختياري)', type: 'select' },
          { key: 'iqamaNo', label: 'رقم الإقامة', type: 'text', required: true },
          { key: 'nationality', label: 'الجنسية', type: 'text' },
          { key: 'profession', label: 'المهنة', type: 'text' },
          { key: 'sponsor', label: 'الكفيل', type: 'text' },
          { key: 'issueDate', label: 'تاريخ الإصدار', type: 'date' },
          { key: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', required: true },
          { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
        ]}
        defaultValues={{}}
        loadOptions={optionLoaders.employees}
        rowToForm={(r) => ({
          ...r,
          issueDate: r.issueDate ? fmtDate(r.issueDate as string) : '',
          expiryDate: r.expiryDate ? fmtDate(r.expiryDate as string) : '',
          employeeId: (r.employee as { id: string } | null | undefined)?.id || '',
        })}
      />
    </div>
  );
}
