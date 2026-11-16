import { describe, it, expect } from 'vitest';
import { reportKpis, groupByEmployee } from '@/lib/report-summary';

const H = ['التاريخ', 'الموظف', 'الرقم', 'القسم', 'الوردية', 'الحالة', 'الدخول', 'الخروج', 'ساعات العمل', 'تأخير (د)', 'خروج مبكر (د)', 'إضافي (د)', 'ملاحظة'];
const R = [
  ['2026-11-01', 'Ali', '102', 'A', 'S', 'متأخر', '08:45', '16:00', '7:15', 35, '—', '—', ''],
  ['2026-11-01', 'Sara', '144', 'A', 'S', 'حاضر', '08:00', '17:00', '9:00', '—', '—', 60, ''],
  ['2026-11-02', 'Ali', '102', 'A', 'S', 'غائب', '—', '—', '0:00', '—', '—', '—', ''],
];

describe('ملخص التقارير', () => {
  it('بطاقات الحضور اليومي', () => {
    const k = Object.fromEntries(reportKpis('daily', H, R).map((x) => [x.label, x.value]));
    expect(k).toMatchObject({ 'السجلات': '3', 'الموظفون': '2', 'حاضر': '1', 'متأخر': '1', 'غائب': '1', 'ساعات العمل': '16:15', 'إجمالي التأخير': '0:35', 'إجمالي الإضافي': '1:00' });
  });
  it('إجمالي لكل موظف', () => {
    const g = groupByEmployee(H, R);
    expect(g.map((x) => (x.subtotal ? String(x.row[0]) : x.row[1]))).toEqual(['Ali', 'Ali', 'إجمالي Ali (2)', 'Sara', 'إجمالي Sara (1)']);
    expect(g[2].row[8]).toBe('7:15');
    expect(g[2].row[9]).toBe(35);
  });
});
