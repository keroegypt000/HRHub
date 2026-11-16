// تحديد نوع الحركة تلقائياً بغض النظر عن زر الجهاز:
// أول بصمة في اليوم = دخول، آخر بصمة = خروج، ما بينهما استراحة/عودة، والمكرر خلال دقيقتين = تكرار
export const DUP_MS = 2 * 60_000;

/** times: أوقات بصمات موظف واحد في يوم واحد (أي ترتيب) — يرجع التسمية لكل عنصر بنفس الترتيب */
export function inferPunchTypes(times: Date[]): string[] {
  const order = times.map((t, i) => ({ t: t.getTime(), i })).sort((a, b) => a.t - b.t);
  const labels: string[] = new Array(times.length);
  const uniq: number[] = [];
  let last = -Infinity;
  for (const o of order) {
    if (o.t - last <= DUP_MS && uniq.length) labels[o.i] = 'تكرار';
    else { uniq.push(o.i); last = o.t; }
  }
  uniq.forEach((idx, k) => {
    if (k === 0) labels[idx] = 'دخول';
    else if (k === uniq.length - 1) labels[idx] = 'خروج';
    else labels[idx] = k % 2 === 1 ? 'خروج استراحة' : 'عودة من استراحة';
  });
  if (uniq.length === 1) labels[uniq[0]] = 'دخول (بدون خروج)';
  return labels;
}

/** يطبق التسمية على قائمة سجلات (لكل موظف ولكل يوم) */
export function labelLogs<T extends { punchTime: Date; employeeId?: string | null; pin?: string }>(
  logs: T[], dayKey: (d: Date) => string,
): Map<T, string> {
  const groups = new Map<string, T[]>();
  for (const l of logs) {
    const k = `${l.employeeId || l.pin}|${dayKey(new Date(l.punchTime))}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }
  const out = new Map<T, string>();
  for (const g of groups.values()) {
    const lab = inferPunchTypes(g.map((l) => new Date(l.punchTime)));
    g.forEach((l, i) => out.set(l, lab[i]));
  }
  return out;
}
