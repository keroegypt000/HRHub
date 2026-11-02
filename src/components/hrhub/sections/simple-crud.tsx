'use client';

// الأقسام الموحدة: الأقسام والمسميات، الورديات، العطلات، مكونات الراتب
import { CrudPanel, optionLoaders, FieldDef } from '@/components/hrhub/crud-panel';
import { Column } from '@/components/hrhub/data-table';
import { StatusBadge } from '@/components/hrhub/common';
import { api, fmtKWD, fmtDate, STATUS_AR } from '@/lib/client';
import { use, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Named { id: string; name: string; notes?: string | null }

// ===== الأقسام والمسميات (تبويبان) =====
export function DepartmentsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <Tabs defaultValue="departments" dir="rtl">
      <TabsList>
        <TabsTrigger value="departments">الأقسام</TabsTrigger>
        <TabsTrigger value="positions">المسميات الوظيفية</TabsTrigger>
      </TabsList>
      <TabsContent value="departments">
        <CrudPanel<Named & { parent?: { name: string } | null; _count?: { employees: number } }>
          entityPath="/api/departments"
          entityLabel="قسم"
          title="الأقسام"
          subtitle="شجرة أقسام هرمية مع عدد الموظفين في كل قسم"
          canWrite={canWrite}
          searchPlaceholder="بحث بالاسم..."
          columns={[
            { key: 'name', header: 'اسم القسم' },
            { key: 'parent', header: 'القسم الأعلى', render: (r) => r.parent?.name || '—' },
            { key: 'count', header: 'الموظفون', render: (r) => <span className="tabular">{r._count?.employees ?? 0}</span> },
            { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—' },
          ]}
          fields={[
            { key: 'name', label: 'اسم القسم', type: 'text', required: true },
            { key: 'parentId', label: 'القسم الأعلى', type: 'select' },
            { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
          ]}
          loadOptions={optionLoaders.departments}
        />
      </TabsContent>
      <TabsContent value="positions">
        <CrudPanel<Named & { _count?: { employees: number } }>
          entityPath="/api/positions"
          entityLabel="مسمى وظيفي"
          title="المسميات الوظيفية"
          subtitle="مسِمّيات العمل مع عدد شاغليها"
          canWrite={canWrite}
          searchPlaceholder="بحث بالاسم..."
          columns={[
            { key: 'name', header: 'المسمى' },
            { key: 'count', header: 'الموظفون', render: (r) => <span className="tabular">{r._count?.employees ?? 0}</span> },
            { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—' },
          ]}
          fields={[
            { key: 'name', label: 'المسمى الوظيفي', type: 'text', required: true },
            { key: 'notes', label: 'ملاحظات', type: 'textarea', span: 2 },
          ]}
        />
      </TabsContent>
    </Tabs>
  );
}

// ===== الورديات =====
interface ShiftRow extends Record<string, unknown> {
  id: string; name: string; type: string; startTime: string; endTime: string;
  crossDay: boolean; graceMinutes: number; earlyGraceMinutes: number; otEnabled: boolean;
  otRoundMinutes: number; halfDayMinutes: number; workDays: string; active: boolean;
  _count?: { assignments: number };
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function ShiftsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <CrudPanel<ShiftRow>
      entityPath="/api/shifts"
      entityLabel="وردية"
      title="الورديات"
      subtitle="ورديات ثابتة/مرنة/ليلية تعبر منتصف الليل — سماحيات وتقريب إضافي معلن"
      canWrite={canWrite}
      searchPlaceholder="بحث باسم الوردية..."
      columns={[
        { key: 'name', header: 'الوردية' },
        { key: 'time', header: 'الوقت', render: (r) => <span className="tabular">{r.startTime} — {r.endTime}{r.crossDay ? ' (+1ي)' : ''}</span> },
        { key: 'type', header: 'النوع', render: (r) => <StatusBadge status={r.type} /> },
        { key: 'grace', header: 'سماحية', render: (r) => <span className="tabular">{r.graceMinutes}د / {r.earlyGraceMinutes}د</span> },
        { key: 'ot', header: 'الإضافي', render: (r) => r.otEnabled ? <span className="text-emerald-700">مفعّل ({r.otRoundMinutes}د تقريب)</span> : <span className="text-muted-foreground">معطل</span> },
        { key: 'days', header: 'أيام العمل', render: (r) => { try { return (JSON.parse(r.workDays) as number[]).map((d) => WEEKDAYS[d]).join('، '); } catch { return r.workDays; } }, hideOnMobile: true },
        { key: 'active', header: 'الحالة', render: (r) => <StatusBadge status={r.active ? 'active' : 'offline'} /> },
      ]}
      fields={[
        { key: 'name', label: 'اسم الوردية', type: 'text', required: true },
        { key: 'type', label: 'النوع', type: 'select', options: [
          { value: 'fixed', label: 'ثابتة' }, { value: 'flexible', label: 'مرنة' }, { value: 'auto', label: 'تلقائية' },
        ] },
        { key: 'startTime', label: 'بداية (HH:MM)', type: 'text', required: true },
        { key: 'endTime', label: 'نهاية (HH:MM)', type: 'text', required: true },
        { key: 'crossDay', label: 'تعبر منتصف الليل (وردية ليلية)', type: 'switch' },
        { key: 'otEnabled', label: 'العمل الإضافي مفعّل', type: 'switch' },
        { key: 'graceMinutes', label: 'سماحية التأخير (دقيقة)', type: 'number' },
        { key: 'earlyGraceMinutes', label: 'سماحية الخروج المبكر', type: 'number' },
        { key: 'otRoundMinutes', label: 'تقريب الإضافي (دقيقة)', type: 'number' },
        { key: 'halfDayMinutes', label: 'عتبة نص يوم (دقيقة)', type: 'number' },
        { key: 'workDaysText', label: 'أيام العمل (0=الأحد، مفصولة بفاصلة)', type: 'text', hint: 'مثال: 0,1,2,3,4' },
        { key: 'active', label: 'الوردية نشطة', type: 'switch' },
      ]}
      defaultValues={{ type: 'fixed', startTime: '08:00', endTime: '17:00', graceMinutes: 10, earlyGraceMinutes: 10, otRoundMinutes: 15, halfDayMinutes: 240, workDaysText: '0,1,2,3,4', crossDay: false, otEnabled: true, active: true }}
      rowToForm={(r) => ({
        ...r,
        workDaysText: (() => { try { return (JSON.parse(r.workDays) as number[]).join(','); } catch { return '0,1,2,3,4'; } })(),
      })}
    />
  );
}

// ===== العطلات الرسمية =====
interface HolidayRow extends Record<string, unknown> {
  id: string; name: string; date: string; endDate?: string | null; recurring: boolean;
}

export function HolidaysSection({ canWrite }: { canWrite: boolean }) {
  return (
    <CrudPanel<HolidayRow>
      entityPath="/api/holidays"
      entityLabel="عطلة"
      title="العطلات الرسمية"
      subtitle="عطلات فردية أو نطاقات (مثل عيد الفطر) مع تكرار سنوي اختياري — تدخل أولوية تغطية اليوم"
      canWrite={canWrite}
      searchPlaceholder="بحث..."
      columns={[
        { key: 'name', header: 'العطلة' },
        { key: 'date', header: 'من', render: (r) => <span className="tabular">{fmtDate(r.date)}</span> },
        { key: 'endDate', header: 'إلى', render: (r) => <span className="tabular">{r.endDate ? fmtDate(r.endDate) : 'يوم واحد'}</span> },
        { key: 'recurring', header: 'تكرار سنوي', render: (r) => r.recurring ? 'نعم' : 'لا' },
      ]}
      fields={[
        { key: 'name', label: 'اسم العطلة', type: 'text', required: true },
        { key: 'recurring', label: 'متكررة سنويًا', type: 'switch' },
        { key: 'date', label: 'التاريخ (من)', type: 'date', required: true },
        { key: 'endDate', label: 'تاريخ النهاية (اختياري)', type: 'date' },
      ]}
      rowToForm={(r) => ({ ...r, date: fmtDate(r.date), endDate: r.endDate ? fmtDate(r.endDate) : '' })}
    />
  );
}

// ===== مكونات الراتب =====
interface ComponentRow extends Record<string, unknown> {
  id: string; name: string; code: string; type: string; calculation: string;
  value: number; percentOfBasic?: number | null; order: number; active: boolean;
}

export function SalaryComponentsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <CrudPanel<ComponentRow>
      entityPath="/api/salary-components"
      entityLabel="مكوّن"
      title="مكونات الراتب"
      subtitle="المكملات والاستقطاعات وطريقة حساب كل منها وترتيبها في القسيمة — قابلة للتعديل من المحاسب/المدير"
      canWrite={canWrite}
      searchPlaceholder="بحث بالاسم أو الرمز..."
      columns={[
        { key: 'name', header: 'المكوّن' },
        { key: 'code', header: 'الرمز', render: (r) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.code}</code> },
        { key: 'type', header: 'النوع', render: (r) => <StatusBadge status={r.type} /> },
        { key: 'calculation', header: 'طريقة الحساب', render: (r) => ({ fixed: 'قيمة ثابتة', attendance: 'من الحضور', percent: 'نسبة من الأساسي', manual: 'يدوي' }[r.calculation] || r.calculation) },
        { key: 'value', header: 'القيمة/النسبة', render: (r) => <span className="tabular">{r.calculation === 'percent' ? `${r.percentOfBasic ?? 0}%` : fmtKWD(r.value)}</span> },
        { key: 'order', header: 'الترتيب', className: 'tabular' },
        { key: 'active', header: 'الحالة', render: (r) => <StatusBadge status={r.active ? 'active' : 'offline'} /> },
      ]}
      fields={[
        { key: 'name', label: 'الاسم', type: 'text', required: true },
        { key: 'code', label: 'الرمز الفريد', type: 'text', required: true, hint: 'مثل HOUSING — لا تعدل رموز النظام' },
        { key: 'type', label: 'النوع', type: 'select', options: [
          { value: 'earning', label: 'مكمل (دخل)' }, { value: 'deduction', label: 'استقطاع' },
        ] },
        { key: 'calculation', label: 'طريقة الحساب', type: 'select', options: [
          { value: 'fixed', label: 'قيمة ثابتة' }, { value: 'percent', label: 'نسبة من الأساسي' },
          { value: 'attendance', label: 'من الحضور' }, { value: 'manual', label: 'يدوي لكل موظف' },
        ] },
        { key: 'value', label: 'القيمة الثابتة (د.ك)', type: 'number' },
        { key: 'percentOfBasic', label: 'النسبة من الأساسي %', type: 'number' },
        { key: 'order', label: 'الترتيب في القسيمة', type: 'number' },
        { key: 'active', label: 'مفعّل', type: 'switch' },
      ]}
      defaultValues={{ type: 'earning', calculation: 'fixed', value: 0, order: 99, active: true }}
    />
  );
}
