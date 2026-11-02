// lib/excel.ts — قوالب الاستيراد والتصدير عبر SheetJS على السيرفر
import * as XLSX from 'xlsx';

export type Cell = string | number | boolean | null;

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
