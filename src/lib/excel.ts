// lib/excel.ts — قوالب الاستيراد والتصدير عبر SheetJS على السيرفر
import * as XLSX from 'xlsx';
import { STATUS_AR } from '@/lib/zk/protocol';

export type Cell = string | number | boolean | null;

// ===== أدوات تحمّل اختلاف أسماء الأعمدة وصيغ البيانات بين القوالب والتصدير =====

/** يقرأ أول عمود موجود من قائمة مفاتيح مرادفة — بحيث يصلح الاستيراد لأي ملف (قالب أو تصدير) */
export function pick(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

/** قراءة تاريخ متسامحة: Date أو رقم تسلسلي Excel أو YYYY-MM-DD أو DD/MM/YYYY أو YYYY/MM/DD */
export function parseDateSafe(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    // رقم تسلسلي Excel (نظام 1900): 25569 = 1970-01-01
    const d = new Date(Math.round((v - 25569) * 86400_000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00.000+03:00`);
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000+03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** حالة البصمة: تقبل رقمًا أو نصًا عربيًا (دخول/خروج...) وتحوّلها لرقم الجهاز */
export function statusFromText(v: unknown): number {
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const found = Object.entries(STATUS_AR).find(([, ar]) => ar === s);
  return found ? Number(found[0]) : 0;
}

/** حالة الموظف: تقبل الإنجليزية والعربية */
const EMP_STATUS_MAP: Record<string, string> = {
  active: 'active', 'نشط': 'active', 'على رأس العمل': 'active',
  suspended: 'suspended', 'موقوف': 'suspended',
  on_leave: 'on_leave', 'on leave': 'on_leave', 'في إجازة': 'on_leave', 'إجازة': 'on_leave',
  terminated: 'terminated', 'منتهي': 'terminated', 'منتهي التعاقد': 'terminated', 'مستقيل': 'terminated',
};
export function employeeStatusFromText(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  return EMP_STATUS_MAP[s] || EMP_STATUS_MAP[String(v ?? '').trim()] || 'active';
}

/** أيام العمل: تقبل "0,1,2" أو "[0,1,2]" (JSON كما يصدرها النظام) */
export function parseWorkDays(v: unknown, fallback = [0, 1, 2, 3, 4]): number[] {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const days = arr.map((x) => parseInt(String(x), 10)).filter(Number.isFinite);
        if (days.length) return days;
      }
    } catch { /* تجاهل واستخدم التقسيم بالنص */ }
  }
  const days = s.split(',').map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite);
  return days.length ? days : fallback;
}

/** كتابة أيام العمل نصًّا مفهومًا في التصدير: "0,1,2,3,4" */
export function workDaysToText(v: unknown): string {
  const days = parseWorkDays(v, []);
  return days.join(',');
}

export function sheetToBuffer(rows: Record<string, Cell>[], sheetName = 'Sheet1'): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** قالب Excel: صف عناوين + صف مثال */
export function templateBuffer(columns: { key: string; example: Cell }[], sheetName: string): Buffer {
  const header = columns.map((c) => c.key);
  const exampleRow = columns.map((c) => c.example);
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** قراءة صفوف من buffer (للاستيراد من المتصفح نستقبل JSON جاهزًا — هنا للسيرفر) */
export function parseWorkbook(buf: Buffer): Record<string, Cell>[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, Cell>>(ws, { defval: null });
}

// ===== تعريفات القوالب لكل كيان =====
export const TEMPLATES: Record<string, { sheet: string; columns: { key: string; example: Cell }[] }> = {
  employees: {
    sheet: 'الموظفون',
    columns: [
      { key: 'الرقم الوظيفي', example: '1001' },
      { key: 'الاسم', example: 'أحمد محمد السالم' },
      { key: 'الجنس', example: 'ذكر' },
      { key: 'الجنسية', example: 'كويتي' },
      { key: 'الرقم المدني', example: '289010103456' },
      { key: 'الجواز', example: 'A1234567' },
      { key: 'الهاتف', example: '99000000' },
      { key: 'البريد', example: 'ahmed@example.com' },
      { key: 'القسم', example: 'الإدارة المالية' },
      { key: 'المسمى الوظيفي', example: 'محاسب' },
      { key: 'تاريخ التعيين', example: '2024-01-15' },
      { key: 'الراتب الأساسي', example: 850 },
      { key: 'الحساب البنكي', example: 'KW81xxxx' },
      { key: 'الحالة', example: 'active' },
      { key: 'PIN البصمة', example: '1001' },
      { key: 'يوم الراحة', example: 'الأحد' },
      { key: 'رصيد الإجازة الافتتاحي', example: 40.412 },
      { key: 'تاريخ الرصيد', example: '2026-11-01' },
      { key: 'يستحق الإضافي', example: 'نعم' },
      { key: 'معفى من البصمة', example: 'لا' },
    ],
  },
  devices: {
    sheet: 'الأجهزة',
    columns: [
      { key: 'الرقم التسلسلي', example: 'CJ9X204860122' },
      { key: 'الاسم', example: 'جهاز المدخل الرئيسي' },
      { key: 'الموديل', example: 'K40' },
      { key: 'الموقع', example: 'المدخل الرئيسي' },
      { key: 'IP', example: '192.168.1.201' },
      { key: 'المنفذ', example: 4370 },
    ],
  },
  shifts: {
    sheet: 'الورديات',
    columns: [
      { key: 'الاسم', example: 'الوردية الصباحية' },
      { key: 'النوع', example: 'fixed' },
      { key: 'بداية', example: '08:00' },
      { key: 'نهاية', example: '17:00' },
      { key: 'تعبر منتصف الليل', example: 'لا' },
      { key: 'سماحية التأخير (دقيقة)', example: 10 },
      { key: 'سماحية الخروج المبكر', example: 10 },
      { key: 'إضافي مفعّل', example: 'نعم' },
      { key: 'تقريب الإضافي', example: 15 },
      { key: 'عتبة نص يوم', example: 240 },
      { key: 'أيام العمل', example: '0,1,2,3,4' },
    ],
  },
  holidays: {
    sheet: 'العطلات',
    columns: [
      { key: 'الاسم', example: 'عيد الفطر' },
      { key: 'التاريخ', example: '2026-03-20' },
      { key: 'تاريخ النهاية', example: '2026-03-23' },
      { key: 'متكرر سنويًا', example: 'لا' },
    ],
  },
  'attendance-logs': {
    sheet: 'سجل البصمة',
    columns: [
      { key: 'الرقم الوظيفي (PIN)', example: '1001' },
      { key: 'الرقم التسلسلي SN', example: 'CJ9X204860122' },
      { key: 'وقت السجلة', example: '2026-01-05 08:25:00' },
      { key: 'الحالة', example: 0 },
      { key: 'طريقة التحقق', example: 1 },
    ],
  },
  'salary-components': {
    sheet: 'مكونات الراتب',
    columns: [
      { key: 'الاسم', example: 'بدل سكن' },
      { key: 'الرمز', example: 'HOUSING' },
      { key: 'النوع', example: 'earning' },
      { key: 'طريقة الحساب', example: 'percent' },
      { key: 'القيمة', example: 0 },
      { key: 'النسبة من الأساسي', example: 30 },
      { key: 'الترتيب', example: 2 },
    ],
  },
};

// ===== جداول التصدير =====
export function exportBuffer(entity: string, rows: Record<string, Cell>[]): Buffer {
  const name = TEMPLATES[entity]?.sheet || entity;
  return sheetToBuffer(rows.length ? rows : [{ 'لا توجد بيانات': '' }], name.slice(0, 30));
}

/** «الأحد» أو «الجمعة والسبت» أو «5,6» → JSON أيام الراحة (null = حسب الوردية) */
export function parseOffDays(v: unknown): string | null {
  const text = String(v ?? '').trim();
  if (!text) return null;
  if (/بدون|لا يوجد|none/i.test(text)) return '[]';
  const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const days = new Set<number>();
  names.forEach((n, i) => { if (text.includes(n)) days.add(i); });
  if (text.includes('الإثنين')) days.add(1);
  for (const m of text.match(/\d/g) || []) { const d = Number(m); if (d >= 0 && d <= 6) days.add(d); }
  return days.size ? JSON.stringify([...days].sort()) : null;
}

/** نعم/لا/1/0/true → boolean (فارغ = undefined لعدم التغيير) */
export function yesNo(v: unknown): boolean | undefined {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return undefined;
  return ['نعم', 'yes', 'true', '1', 'y', '✓'].includes(t);
}
