// صف الإجمالي أسفل أي تقرير: يجمع الأعمدة الرقمية والأوقات (س:د) ويترك أعمدة التعريف فارغة
type Cell = string | number;
const ID_COLS = /رقم|^م$|التاريخ|اليوم|الكود|PIN|IP|^الوقت$|^الدخول$|^الخروج$|^الوردية$|الفترة|الحالة|عنوان|وصف|الاسم|الموظف|القسم|المسمى|الجهاز|الصورة|استثناء|نوع/;

const isNum = (v: Cell) => typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(String(v).trim()));
const isHM = (v: Cell) => /^\d+:\d{2}$/.test(String(v).trim());
const empty = (v: Cell) => v === '' || v === '—' || v === null || v === undefined;

export function reportTotals(headers: string[], rows: Cell[][]): Cell[] | null {
  if (!rows.length) return null;
  let any = false;
  const out: Cell[] = headers.map((h, i) => {
    if (ID_COLS.test(h)) return '';
    const vals = rows.map((r) => r[i]).filter((v) => !empty(v));
    if (!vals.length) return '';
    if (vals.every(isNum)) {
      const sum = vals.reduce<number>((s, v) => s + Number(v), 0);
      any = true;
      const decimals = vals.some((v) => String(v).includes('.')) ? Math.min(3, Math.max(...vals.map((v) => (String(v).split('.')[1] || '').length))) : 0;
      return decimals ? sum.toFixed(decimals) : sum;
    }
    if (vals.every(isHM)) {
      const mins = vals.reduce<number>((s, v) => { const [h0, m0] = String(v).split(':').map(Number); return s + h0 * 60 + m0; }, 0);
      any = true;
      return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
    }
    return '';
  });
  if (!any) return null;
  out[0] = `الإجمالي (${rows.length})`;
  return out;
}
