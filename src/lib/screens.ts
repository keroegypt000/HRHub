// شاشات البرنامج وصلاحياتها: كل شاشة = مفتاح القائمة + الكيانات التي تقرأها/تكتبها على السيرفر
// مستوى المستخدم لكل شاشة: none (مخفية) | view (عرض فقط) | edit (عرض وتعديل)
export type ScreenLevel = 'none' | 'view' | 'edit';

export interface ScreenDef { key: string; label: string; group: string; entities: string[]; adminOnly?: boolean }

export const SCREEN_GROUPS = ['عام', 'الموظفون', 'الحضور والإجازات', 'الرواتب والمستحقات', 'المستندات والتنبيهات', 'التقارير', 'الإعدادات والنظام'] as const;

export const SCREENS: ScreenDef[] = [
  { key: 'dashboard', label: 'لوحة التحكم', group: 'عام', entities: ['dashboard'] },
  { key: 'employees', label: 'كل الموظفين', group: 'الموظفون', entities: ['employees', 'employees-photo', 'files'] },
  { key: 'iqamas', label: 'الإقامات', group: 'الموظفون', entities: ['iqamas'] },
  { key: 'contracts', label: 'العقود', group: 'الموظفون', entities: ['contracts'] },
  { key: 'insurance', label: 'التأمين وإصابات العمل', group: 'الموظفون', entities: ['insurances', 'work-injuries'] },
  { key: 'custody', label: 'العُهد', group: 'الموظفون', entities: ['custody'] },
  { key: 'departments', label: 'الأقسام والمسميات', group: 'الموظفون', entities: ['departments', 'positions'] },
  { key: 'companies', label: 'الشركات ومواقع العمل', group: 'الموظفون', entities: ['departments'] },
  { key: 'daily-attendance', label: 'الحضور اليومي', group: 'الحضور والإجازات', entities: ['daily-attendance'] },
  { key: 'leaves', label: 'الإجازات', group: 'الحضور والإجازات', entities: ['leaves', 'leave-approve', 'leave-types'] },
  { key: 'requests', label: 'الطلبات والموافقات', group: 'الحضور والإجازات', entities: ['requests', 'workflow', 'loans'] },
  { key: 'shifts', label: 'الورديات', group: 'الحضور والإجازات', entities: ['shifts', 'shift-assignments'] },
  { key: 'holidays', label: 'العطلات الرسمية', group: 'الحضور والإجازات', entities: ['holidays'] },
  { key: 'payroll', label: 'الرواتب والقسائم', group: 'الرواتب والمستحقات', entities: ['payroll-periods', 'payslips'] },
  { key: 'adjustments', label: 'الحوافز والجزاءات', group: 'الرواتب والمستحقات', entities: ['adjustments'] },
  { key: 'end-of-service', label: 'نهاية الخدمة', group: 'الرواتب والمستحقات', entities: ['end-of-service', 'settlements'] },
  { key: 'leave-balances', label: 'أرصدة الإجازات', group: 'الرواتب والمستحقات', entities: ['leaves'] },
  { key: 'departed', label: 'المنصرفون والمستحقات', group: 'الرواتب والمستحقات', entities: ['settlements'] },
  { key: 'deceased', label: 'الموظفون السابقون', group: 'الرواتب والمستحقات', entities: ['settlements'] },
  { key: 'alerts', label: 'التنبيهات', group: 'المستندات والتنبيهات', entities: ['alerts'] },
  { key: 'vehicles', label: 'السيارات', group: 'المستندات والتنبيهات', entities: ['vehicles'] },
  { key: 'company-contracts', label: 'عقود الشركة', group: 'المستندات والتنبيهات', entities: ['company-contracts'] },
  { key: 'passports', label: 'الجوازات', group: 'المستندات والتنبيهات', entities: ['passports'] },
  { key: 'health-cards', label: 'الكروت الصحية', group: 'المستندات والتنبيهات', entities: ['health-cards'] },
  { key: 'forms', label: 'نماذج الشؤون', group: 'المستندات والتنبيهات', entities: ['forms'] },
  { key: 'reports', label: 'التقارير وكشف الوقت', group: 'التقارير', entities: ['reports', 'export'] },
  { key: 'punch-movements', label: 'حركات البصمة بالصور', group: 'التقارير', entities: ['reports'] },
  { key: 'salary-components', label: 'مكونات الراتب', group: 'الإعدادات والنظام', entities: ['salary-components'] },
  { key: 'devices', label: 'أجهزة البصمة', group: 'الإعدادات والنظام', entities: ['devices'] },
  { key: 'attendance-logs', label: 'سجل البصمات الخام', group: 'الإعدادات والنظام', entities: ['attendance-logs'] },
  { key: 'import', label: 'الاستيراد والتصدير', group: 'الإعدادات والنظام', entities: ['import', 'export'] },
  { key: 'settings', label: 'الإعدادات', group: 'الإعدادات والنظام', entities: ['settings', 'restore'], adminOnly: true },
  { key: 'users', label: 'المستخدمون والصلاحيات', group: 'الإعدادات والنظام', entities: ['users'], adminOnly: true },
  { key: 'audit', label: 'سجل التدقيق', group: 'الإعدادات والنظام', entities: ['audit'], adminOnly: true },
];

/** بيانات مرجعية تُقرأ من أي شاشة (قوائم الاختيار) — لا تُحجب بإخفاء شاشتها */
export const LOOKUP_ENTITIES = new Set(['employees', 'departments', 'positions', 'shifts', 'leave-types', 'holidays', 'files']);

export const LEVEL_AR: Record<ScreenLevel, string> = { none: 'مخفية', view: 'عرض فقط', edit: 'عرض وتعديل' };
