// lib/requests.ts — كتالوج أنواع طلبات الموظفين وسلاسل الموافقات
// مطابق لنموذج WORKFLOW APPROVAL SETTING: 9 أنواع × 4 مستويات موافقة + إيميل إشعار

export interface RequestTypeDef {
  value: string;
  label: string;
  /** حقول النموذج الديناميكية */
  fields: ('days' | 'dateRange' | 'amount' | 'installments' | 'description' | 'purpose')[];
  needsAttachment?: boolean;
}

export const REQUEST_TYPES: RequestTypeDef[] = [
  { value: 'vacation', label: 'إجازة (سنوية/مرضية/بدون راتب/أخرى)', fields: ['dateRange', 'description'] },
  { value: 'loan', label: 'سلفة / قرض', fields: ['amount', 'installments', 'description'] },
  { value: 'salary_certificate', label: 'شهادة راتب / خطاب إلى من يهمه الأمر', fields: ['purpose'] },
  { value: 'salary_continuity', label: 'شهادة استمرارية راتب', fields: ['purpose'] },
  { value: 'uniform', label: 'بذلة / زي موحد', fields: ['description'] },
  { value: 'it_device', label: 'جهاز تقنية (لابتوب/حاسوب/غيره)', fields: ['description'] },
  { value: 'stationary', label: 'أدوات مكتبية', fields: ['description'] },
  { value: 'business_card', label: 'كارت أعمال', fields: ['description'] },
  { value: 'equipment', label: 'معدات', fields: ['description'] },
];

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPES.find((t) => t.value === type)?.label || type;
}

export const REQUEST_STATUS_AR: Record<string, string> = {
  pending: 'قيد الموافقة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export interface RequestStep {
  userId: string;
  name: string;
  status: 'waiting' | 'approved' | 'rejected';
  comment?: string;
  at?: string;
}

export function parseSteps(json: string | null | undefined): RequestStep[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** المستويات الأربعة من إعدادات سلسلة الموافقة — أول ما يوجد per (unit, type) ثم ALL */
export interface WorkflowLevels {
  level1UserId: string | null;
  level2UserId: string | null;
  level3UserId: string | null;
  level4UserId: string | null;
  notifyEmail: string | null;
}

/** المستوى الحالي الذي يقف عند الطلب — أول مستوى بحالة waiting بعد المستويات المعتمدة */
export function currentPendingStep(steps: RequestStep[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].status === 'waiting') return i;
  }
  return -1; // كلها معتمدة
}
