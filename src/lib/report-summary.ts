// ملخص التقارير: بطاقات المجاميع أعلى التقرير + إجمالي لكل موظف
import { reportTotals } from '@/lib/report-totals';

export type Cell = string | number;
export interface Kpi { label: string; value: string; tone?: 'green' | 'amber' | 'red' | 'blue' | 'teal' | 'slate' }

const empty = (v: Cell) => v === '' || v === '—' || v === null || v === undefined;
const num = (v: Cell) => (empty(v) ? 0 : Number(String(v).replace('%', '')) || 0);
const hmToMin = (v: Cell) => { const m = String(v).match(/^(\d+):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const fmtNum = (n: number, d = 0) => (d ? n.toFixed(d) : String(Math.round(n)));

function helpers(headers: string[], rows: Cell[][]) {
  const idx = (name: string) => headers.indexOf(name);
  const col = (name: string) => { const i = idx(name); return i < 0 ? [] : rows.map((r) => r[i]); };
  return {
    count: () => rows.length,
    distinct: (...names: string[]) => { for (const n of names) { const c = col(n); if (c.length) return new Set(c.map(String)).size; } return 0; },
    where: (name: string, value: string) => col(name).filter((v) => String(v) === value).length,
    sum: (name: string) => col(name).reduce<number>((s, v) => s + num(v), 0),
    sumHM: (name: string) => col(name).reduce<number>((s, v) => s + hmToMin(v), 0),
    avg: (name: string) => { const c = col(name).filter((v) => !empty(v)); return c.length ? c.reduce<number>((s, v) => s + num(v), 0) / c.length : 0; },
  };
}

/** بطاقات الملخص حسب نوع التقرير */
export function reportKpis(type: string, headers: string[], rows: Cell[][]): Kpi[] {
  const h = helpers(headers, rows);
  switch (type) {
    case 'daily':
      return [
        { label: 'السجلات', value: String(h.count()), tone: 'slate' },
        { label: 'الموظفون', value: String(h.distinct('الرقم')), tone: 'slate' },
        { label: 'حاضر', value: String(h.where('الحالة', 'حاضر')), tone: 'green' },
        { label: 'متأخر', value: String(h.where('الحالة', 'متأخر')), tone: 'amber' },
        { label: 'غائب', value: String(h.where('الحالة', 'غائب')), tone: 'red' },
        { label: 'بصمة ناقصة', value: String(h.where('الحالة', 'بصمة ناقصة')), tone: 'red' },
        { label: 'في إجازة', value: String(h.where('الحالة', 'في إجازة')), tone: 'blue' },
        { label: 'ساعات العمل', value: fmtHM(h.sumHM('ساعات العمل')), tone: 'teal' },
        { label: 'إجمالي التأخير', value: fmtHM(h.sum('تأخير (د)')), tone: 'amber' },
        { label: 'إجمالي الإضافي', value: fmtHM(h.sum('إضافي (د)')), tone: 'teal' },
      ];
    case 'monthly':
      return [
        { label: 'الموظفون', value: String(h.count()), tone: 'slate' },
        { label: 'أيام الحضور', value: fmtNum(h.sum('أيام حضور')), tone: 'green' },
        { label: 'أيام التأخير', value: fmtNum(h.sum('تأخير (يوم)')), tone: 'amber' },
        { label: 'أيام الغياب', value: fmtNum(h.sum('غياب')), tone: 'red' },
        { label: 'بصمة ناقصة', value: fmtNum(h.sum('بصمة ناقصة')), tone: 'red' },
        { label: 'أيام الإجازة', value: fmtNum(h.sum('إجازة')), tone: 'blue' },
        { label: 'ساعات التأخير', value: fmtNum(h.sum('ساعات تأخير'), 1), tone: 'amber' },
        { label: 'ساعات الإضافي', value: fmtNum(h.sum('ساعات إضافي'), 1), tone: 'teal' },
        { label: 'ساعات العمل', value: fmtNum(h.sum('ساعات عمل'), 1), tone: 'teal' },
        { label: 'متوسط نسبة الدوام', value: `${Math.round(h.avg('نسبة الدوام'))}%`, tone: 'green' },
      ];
    case 'late':
      return [
        { label: 'الحالات', value: String(h.count()), tone: 'slate' },
        { label: 'الموظفون', value: String(h.distinct('الرقم')), tone: 'slate' },
        { label: 'إجمالي التأخير', value: fmtHM(h.sum('دقائق التأخير')), tone: 'amber' },
        { label: 'إجمالي الخروج المبكر', value: fmtHM(h.sum('دقائق الخروج المبكر')), tone: 'amber' },
      ];
    case 'overtime':
      return [
        { label: 'الأيام', value: String(h.count()), tone: 'slate' },
        { label: 'الموظفون', value: String(h.distinct('الرقم')), tone: 'slate' },
        { label: 'ساعات الإضافي', value: fmtNum(h.sum('ساعات إضافي'), 2), tone: 'teal' },
        { label: 'القيمة المقترحة (د.ك)', value: fmtNum(h.sum('قيمة مقترحة (×1.25)'), 3), tone: 'green' },
      ];
    case 'absence':
      return [
        { label: 'إجمالي الأيام', value: String(h.count()), tone: 'slate' },
        { label: 'الموظفون', value: String(h.distinct('الرقم')), tone: 'slate' },
        { label: 'غياب', value: String(h.where('الحالة', 'غائب')), tone: 'red' },
        { label: 'بصمة ناقصة', value: String(h.where('الحالة', 'بصمة ناقصة')), tone: 'amber' },
      ];
    case 'leaves':
      return [
        { label: 'الموظفون', value: String(h.count()), tone: 'slate' },
        { label: 'إجمالي أيام الإجازة', value: fmtNum(h.sum('إجمالي الأيام'), 1), tone: 'blue' },
        { label: 'مدفوعة', value: fmtNum(h.sum('مدفوعة'), 1), tone: 'green' },
        { label: 'غير مدفوعة', value: fmtNum(h.sum('غير مدفوعة'), 1), tone: 'red' },
      ];
    case 'punches':
      return [
        { label: 'الحركات', value: String(h.count()), tone: 'slate' },
        { label: 'الموظفون', value: String(h.distinct('رقم الموظف')), tone: 'slate' },
        { label: 'دخول', value: String(h.where('نوع العملية', 'دخول')), tone: 'green' },
        { label: 'خروج', value: String(h.where('نوع العملية', 'خروج')), tone: 'blue' },
        { label: 'بالصور', value: String(rows.filter((r) => r.some((c) => String(c).startsWith('photo:'))).length), tone: 'teal' },
      ];
    default:
      return [];
  }
}

/** عمود اسم الموظف في التقرير (لتجميع الإجمالي لكل موظف) */
export function employeeColumn(headers: string[]): { name: number; code: number } | null {
  const name = headers.findIndex((x) => x === 'الموظف' || x === 'الاسم');
  const code = headers.findIndex((x) => x === 'الرقم' || x === 'رقم الموظف');
  return name >= 0 ? { name, code } : null;
}

/** صفوف مجمعة حسب الموظف مع سطر «إجمالي الموظف» بعد كل موظف (للعرض والطباعة والتصدير) */
export function groupByEmployee(headers: string[], rows: Cell[][]): { row: Cell[]; subtotal: boolean }[] {
  const ec = employeeColumn(headers);
  if (!ec) return rows.map((row) => ({ row, subtotal: false }));
  const key = (r: Cell[]) => `${r[ec.code] ?? ''}|${r[ec.name]}`;
  const groups = new Map<string, Cell[][]>();
  for (const r of rows) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  // داخل كل موظف: ترتيب تصاعدي حسب التاريخ ثم الوقت
  const dateCol = headers.findIndex((x) => x === 'التاريخ');
  const timeCol = headers.findIndex((x) => x === 'الوقت');
  const seqCol = headers.findIndex((x) => x === 'م');
  if (seqCol >= 0) {
    for (const g of groups.values()) g.sort((a, b) => Number(a[seqCol]) - Number(b[seqCol]));
  } else if (dateCol >= 0) {
    const k = (r: Cell[]) => `${r[dateCol] ?? ''} ${timeCol >= 0 ? r[timeCol] ?? '' : ''}`;
    for (const g of groups.values()) g.sort((a, b) => k(a).localeCompare(k(b)));
  }
  const out: { row: Cell[]; subtotal: boolean }[] = [];
  for (const [, g] of groups) {
    for (const r of g) out.push({ row: r, subtotal: false });
    const t = reportTotals(headers, g) || headers.map(() => '');
    t[0] = `إجمالي ${g[0][ec.name]} (${g.length})`;
    out.push({ row: t, subtotal: true });
  }
  return out;
}
