// lib/audit.ts — سجل التدقيق: كل كتابة تُسجَّل بوصف عربي تلقائي
import { db } from '@/lib/db';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'login' | 'logout' | 'sync' | 'import'
  | 'approve' | 'pay' | 'compute' | 'reopen' | 'denied' | 'restore' | 'reset';

const ACTION_AR: Record<AuditAction, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  sync: 'مزامنة',
  import: 'استيراد',
  approve: 'اعتماد',
  pay: 'صرف',
  compute: 'حساب',
  reopen: 'إعادة فتح',
  denied: 'محاولة مرفوضة',
  restore: 'استعادة',
  reset: 'مسح بيانات',
};

const ENTITY_AR: Record<string, string> = {
  user: 'مستخدم', employee: 'موظف', department: 'قسم', position: 'مسمى وظيفي',
  contract: 'عقد', shift: 'وردية', 'shift-assignment': 'توزيعة وردية',
  'leave-type': 'نوع إجازة', leave: 'طلب إجازة', holiday: 'عطلة رسمية',
  device: 'جهاز بصمة', 'attendance-log': 'سجل بصمة', 'daily-attendance': 'حضور يومي',
  'salary-component': 'مكوّن راتب', 'payroll-period': 'فترة رواتب', payslip: 'قسيمة راتب',
  settings: 'الإعدادات', file: 'ملف', import: 'استيراد', restore: 'نقطة استعادة',
  session: 'جلسة', 'payslip-item': 'بند قسيمة',
  passport: 'جواز سفر', vehicle: 'مركبة', 'company-contract': 'عقد شركة',
  settlement: 'تسوية مستحقات', 'end-of-service': 'نهاية خدمة',
};

export function describeAr(action: AuditAction, entity: string, name?: string): string {
  const a = ACTION_AR[action] || action;
  const e = ENTITY_AR[entity] || entity;
  return name ? `${a} ${e}: ${name}` : `${a} ${e}`;
}

export async function logAudit(params: {
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
  description?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        description: params.description || describeAr(params.action, params.entity),
      },
    });
  } catch (err) {
    // لا نُفشل العملية الأساسية بسبب فشل التدقيق لكن نسجل الخطأ
    console.error('audit error', err);
  }
}

/** تلخيص تغييرات before/after للحقول المتغيرة فقط */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const b = before?.[key];
    const a = after[key];
    const bs = b instanceof Date ? b.toISOString() : b;
    const as_ = a instanceof Date ? a.toISOString() : a;
    if (JSON.stringify(bs) !== JSON.stringify(as_)) out[key] = { from: bs, to: as_ };
  }
  return out;
}
