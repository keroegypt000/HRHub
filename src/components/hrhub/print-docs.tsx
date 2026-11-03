'use client';

// print-docs — نظام المستندات المطبوعة: قالب موحد voucherDocHtml بهوية ADMS FOR HR MANAGMENT
// قسيمة راتب، شهادة راتب، خطاب تعريف، كشف شهري، إشعار إنهاء/تجديد عقد
import { tafqit } from '@/lib/tafqit-client';
import { fmtKWD, fmtDate } from '@/lib/client';

interface DocSpec {
  title: string;
  refNo: string;
  date: string;
  body: string; // HTML داخلي
  signatures?: string[];
  footer?: string;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** القالب الموحد — يفتح نافذة طباعة بهوية ADMS FOR HR MANAGMENT */
export function voucherDocHtml(spec: DocSpec, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(spec.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, 'Segoe UI', Tahoma, sans-serif; color: #1a2b26; padding: 24px; background: #fff; }
  .doc { max-width: 780px; margin: 0 auto; border: 2px solid #1F8A70; border-radius: 12px; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: #1F8A70; color: #fff; }
  .head .logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; }
  .head .logo .mark { width: 40px; height: 40px; background: #fff; color: #1F8A70; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; }
  .head .meta { text-align: left; font-size: 12px; line-height: 1.7; }
  .title { text-align: center; padding: 14px; font-size: 18px; font-weight: 800; color: #1F8A70; border-bottom: 1px dashed #b9d9cf; }
  .body { padding: 22px 26px; font-size: 14px; line-height: 2; }
  .body table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
  .body th, .body td { border: 1px solid #cde3dc; padding: 8px 10px; text-align: right; font-size: 13px; }
  .body th { background: #eef7f4; color: #14523f; font-weight: 700; }
  .body td.num { font-variant-numeric: tabular-nums; text-align: center; }
  .body .net { background: #1F8A70; color: #fff; font-weight: 800; }
  .tafqit { background: #eef7f4; border: 1px dashed #1F8A70; border-radius: 8px; padding: 10px 14px; margin: 12px 0; font-weight: 700; color: #14523f; }
  .signs { display: flex; justify-content: space-between; gap: 16px; margin-top: 44px; }
  .sign { flex: 1; text-align: center; font-size: 13px; }
  .sign .line { margin-top: 34px; border-top: 1.5px solid #666; padding-top: 6px; }
  .foot { text-align: center; font-size: 11px; color: #6b7f79; padding: 10px; border-top: 1px dashed #b9d9cf; background: #f7fbfa; }
  @media print { body { padding: 0; } .doc { border: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="doc">
    <div class="head">
      <div class="logo"><div class="mark">AD</div><div>${esc(companyName)}<div style="font-size:11px;font-weight:400;opacity:.85">ADMS FOR HR MANAGMENT — الموارد البشرية والحضور والرواتب</div></div></div>
      <div class="meta">رقم المرجع: <b>${esc(spec.refNo)}</b><br>التاريخ: <b>${esc(spec.date)}</b></div>
    </div>
    <div class="title">${esc(spec.title)}</div>
    <div class="body">${spec.body}</div>
    <div class="signs">
      ${(spec.signatures || ['الموظف', 'المسؤول المباشر', 'الموارد البشرية']).map((s) => `<div class="sign"><b>${esc(s)}</b><div class="line">الاسم والتوقيع</div></div>`).join('')}
    </div>
    <div class="foot">${esc(spec.footer || 'هذا المستند صادر آليًا من نظام ADMS FOR HR MANAGMENT — دولة الكويت')}${spec.footer ? '' : ` · مرجع ${esc(spec.refNo)}`}</div>
  </div>
</body>
</html>`;
}

export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

// ===== 1. قسيمة راتب =====
export interface PayslipDocData {
  employee: { name: string; code: string; department?: { name: string } | null; position?: { name: string } | null; bankAccount?: string | null; nationality?: string | null; civilId?: string | null };
  period: { name: string; startDate: string; endDate: string };
  basicSalary: number;
  items: { name: string; type: string; amount: number; note?: string | null }[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  workedDays?: number;
  absenceDays?: number;
}

export function payslipDoc(slip: PayslipDocData, companyName: string): string {
  const earnings = slip.items.filter((i) => i.type === 'earning');
  const deductions = slip.items.filter((i) => i.type === 'deduction');
  const maxLen = Math.max(earnings.length, deductions.length, 1);
  const rows = Array.from({ length: maxLen }).map((_, idx) => {
    const e = earnings[idx];
    const d = deductions[idx];
    return `<tr>
      <td>${esc(e?.name || '')}</td><td class="num">${e ? fmtKWD(e.amount) : ''}</td>
      <td>${esc(d?.name || '')}</td><td class="num">${d ? fmtKWD(d.amount) : ''}</td>
    </tr>`;
  }).join('');

  const body = `
    <table>
      <tr><th style="width:25%">الموظف</th><td>${esc(slip.employee.name)} (${esc(slip.employee.code)})</td>
          <th style="width:20%">الفترة</th><td>${esc(slip.period.name)}</td></tr>
      <tr><th>القسم</th><td>${esc(slip.employee.department?.name || '—')}</td>
          <th>المسمى</th><td>${esc(slip.employee.position?.name || '—')}</td></tr>
      <tr><th>الرقم المدني</th><td>${esc(slip.employee.civilId || '—')}</td>
          <th>الحساب البنكي</th><td>${esc(slip.employee.bankAccount || '—')}</td></tr>
    </table>
    <table>
      <thead><tr><th>المكملات</th><th style="width:18%">مبلغ (د.ك)</th><th>الاستقطاعات</th><th style="width:18%">مبلغ (د.ك)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><th>إجمالي المكملات</th><td class="num">${fmtKWD(slip.totalEarnings)}</td>
            <th>إجمالي الاستقطاعات</th><td class="num">${fmtKWD(slip.totalDeductions)}</td></tr>
        <tr class="net"><td colspan="2">صافي الراتب المستحق</td><td colspan="2" class="num">${fmtKWD(slip.netPay)} د.ك</td></tr>
      </tfoot>
    </table>
    <div class="tafqit">فقط ${esc(tafqit(slip.netPay))}</div>
    <p style="font-size:12px;color:#557">
      أيام العمل ${slip.workedDays ?? 0} — أيام الغياب ${slip.absenceDays ?? 0} ·
      الراتب الأساسي ${fmtKWD(slip.basicSalary)} د.ك · العملة: دينار كويتي ثلاث خانات عشرية.
    </p>`;

  return voucherDocHtml({
    title: 'قسيمة راتب',
    refNo: `PS-${slip.period.name}-${slip.employee.code}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['الموظف', 'الموارد البشرية', 'الختم'],
    footer: `قسيمة راتب ${slip.period.name} — سريّة بين الموظف والجهة`,
  }, companyName);
}

// ===== 2. شهادة راتب =====
export function salaryCertificateDoc(
  employee: { name: string; code: string; department?: { name: string } | null; position?: { name: string } | null; basicSalary: number },
  to: string,
  slips: { period: { name: string }; netPay: number }[],
  companyName: string
): string {
  const rows = slips.map((s) => `<tr><td>${esc(s.period.name)}</td><td class="num">${fmtKWD(s.netPay)}</td></tr>`).join('');
  const body = `
    <p>إلى: <b>${esc(to || 'من يعنيه')}</b></p>
    <p>نشهد بأن <b>${esc(employee.name)}</b> (${esc(employee.code)}) يعمل لدى ${esc(companyName)} بصفة
    <b>${esc(employee.position?.name || 'موظف')}</b> في قسم <b>${esc(employee.department?.name || '—')}</b>،
    وأن راتبه الأساسي <b>${fmtKWD(employee.basicSalary)} د.ك</b> (فقط ${esc(tafqit(employee.basicSalary))}).</p>
    ${slips.length ? `<table><thead><tr><th>الفترة</th><th>صافي الراتب (د.ك)</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    <p>صدرت هذه الشهادة بناءً على طلبه للاستخدام الرسمي.</p>`;
  return voucherDocHtml({
    title: 'شهادة راتب',
    refNo: `SC-${employee.code}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['موارد البشرية', 'المدير العام', 'الختم'],
  }, companyName);
}

// ===== 3. خطاب تعريف =====
export function introLetterDoc(
  employee: { name: string; code: string; department?: { name: string } | null; position?: { name: string } | null; nationality?: string | null; civilId?: string | null },
  purpose: string,
  companyName: string
): string {
  const body = `
    <p>إلى من يعنيه،</p>
    <p>نشهد بأن <b>${esc(employee.name)}</b> — الرقم الوظيفي (${esc(employee.code)}) — يعمل لدى ${esc(companyName)}
    بصفة <b>${esc(employee.position?.name || 'موظف')}</b> في قسم <b>${esc(employee.department?.name || '—')}</b>${employee.nationality ? `، وجنسية <b>${esc(employee.nationality)}</b>` : ''}.</p>
    <p>صدر هذا الخطاب بناءً على طلبه بهدف: <b>${esc(purpose || 'معاملات رسمية')}</b>.</p>
    <p>ونشكر لكم حسن تعاونكم.</p>`;
  return voucherDocHtml({
    title: 'خطاب تعريف موظف',
    refNo: `IL-${employee.code}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['موارد البشرية', 'المدير العام', 'الختم'],
  }, companyName);
}

// ===== 4. كشف حضور ورواتب شهري =====
export function monthlyStatementDoc(
  periodName: string,
  rows: { name: string; code: string; basicSalary: number; netPay: number; workedDays: number; absenceDays: number }[],
  companyName: string
): string {
  const body = `
    <table>
      <thead><tr><th>#</th><th>الموظف</th><th>الرقم</th><th>الأساسي (د.ك)</th><th>أيام العمل</th><th>الغياب</th><th>الصافي (د.ك)</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${esc(r.code)}</td>
          <td class="num">${fmtKWD(r.basicSalary)}</td><td class="num">${r.workedDays}</td><td class="num">${r.absenceDays}</td>
          <td class="num">${fmtKWD(r.netPay)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr class="net"><td colspan="6">الإجمالي</td><td class="num">${fmtKWD(rows.reduce((s, r) => s + r.netPay, 0))}</td></tr></tfoot>
    </table>`;
  return voucherDocHtml({
    title: `كشف حضور ورواتب — ${periodName}`,
    refNo: `MS-${periodName}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['المحاسب', 'المدير المالي', 'الختم'],
  }, companyName);
}

// ===== 5. إشعار إنهاء/تجديد عقد =====
export function contractNoticeDoc(
  employee: { name: string; code: string },
  oldContract: { contractNo: string; startDate: string; endDate?: string | null; status: string },
  newContract?: { contractNo: string; startDate: string; endDate?: string | null; basicSalary: number } | null,
  kind: 'renew' | 'terminate' = 'renew',
  reason?: string,
  companyName = 'شركة ADMS'
): string {
  const title = kind === 'renew' ? 'إشعار تجديد عقد' : 'إشعار إنهاء عقد';
  const body = `
    <p>الموظف: <b>${esc(employee.name)}</b> (${esc(employee.code)})</p>
    <table>
      <tr><th>العقد الحالي</th><td>${esc(oldContract.contractNo)}</td><th>من</th><td>${esc(oldContract.startDate)}</td><th>إلى</th><td>${esc(oldContract.endDate || '—')}</td></tr>
    </table>
    ${kind === 'renew' && newContract ? `
      <p>تم <b>تجديد</b> العقد بعقد جديد رقم <b>${esc(newContract.contractNo)}</b> من <b>${esc(newContract.startDate)}</b> إلى <b>${esc(newContract.endDate || 'غير محدد')}</b> براتب أساسي ${fmtKWD(newContract.basicSalary)} د.ك.</p>
    ` : `
      <p>تم <b>إنهاء</b> العقد${reason ? ` بسبب: <b>${esc(reason)}</b>` : ''}.</p>
    `}
    <p>يرجى مراجعة الموارد البشرية لاستكمال الإجراءات.</p>`;
  return voucherDocHtml({
    title,
    refNo: `CN-${oldContract.contractNo}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['الموظف', 'الموارد البشرية', 'الختم'],
  }, companyName);
}

// ===== 6. كشف مستحقات نهاية الخدمة =====
export interface SettlementDocData {
  employee: { name: string; code: string; department?: { name: string } | null; nationality?: string | null; civilId?: string | null };
  reasonAr: string;
  departureDate: string;
  hireDate: string;
  yearsServed: number;
  lastWage: number;
  indemnityFull: number;
  factor: number;
  eosAmount: number;
  leaveAllowance: number;
  otherDues: number;
  deductions: number;
  totalDue: number;
  paidAmount: number;
  note?: string;
  law: string;
}

export function indemnityDoc(s: SettlementDocData, companyName = 'شركة ADMS'): string {
  const remaining = Math.round((s.totalDue - s.paidAmount) * 1000) / 1000;
  const row = (label: string, value: number, cls = '') =>
    `<tr><th>${esc(label)}</th><td class="num ${cls}">${fmtKWD(value)} د.ك</td></tr>`;
  const body = `
    <p>الموظف: <b>${esc(s.employee.name)}</b> (${esc(s.employee.code)})
       ${s.employee.department ? ` — القسم: <b>${esc(s.employee.department.name)}</b>` : ''}</p>
    <table>
      <tr><th>سبب نهاية الخدمة</th><td>${esc(s.reasonAr)}</td><th>تاريخها</th><td>${esc(s.departureDate)}</td></tr>
      <tr><th>تاريخ التعيين</th><td>${esc(s.hireDate)}</td><th>مدة الخدمة</th><td>${esc(s.yearsServed)} سنة</td></tr>
      <tr><th>آخر أجر شهري</th><td class="num">${fmtKWD(s.lastWage)} د.ك</td><th>المعامل القانوني</th><td class="num">${esc(String(s.factor))}</td></tr>
    </table>
    <table>
      ${row('مكافأة نهاية الخدمة (القانونية كاملة)', s.indemnityFull)}
      ${row('المكافأة المستحقة بعد المعامل', s.eosAmount)}
      ${row('بدل الإجازات غير المستخدمة', s.leaveAllowance)}
      ${row('مستحقات أخرى', s.otherDues)}
      ${row('الاستقطاعات / القروض', s.deductions)}
      <tr class="net"><th>إجمالي المستحقات</th><td class="num">${fmtKWD(s.totalDue)} د.ك</td></tr>
      ${row('المدفوع حتى الآن', s.paidAmount)}
      <tr class="net"><th>المتبقي للسداد</th><td class="num">${fmtKWD(remaining)} د.ك</td></tr>
    </table>
    ${s.note ? `<p>ملاحظات: ${esc(s.note)}</p>` : ''}
    <p class="tafqit">المرجع القانوني: ${esc(s.law)} — تُحسب المكافأة نصف شهر لكل سنة من أول 5 سنوات وشهرًا لكل سنة بعدها، وتُصرف بالكامل عند إنهاء الخدمة أو الوفاة وعلى درجات عند الاستقالة حسب المادة 49.</p>`;
  return voucherDocHtml({
    title: 'كشف مستحقات نهاية الخدمة',
    refNo: `EOS-${s.employee.code}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['الموظف / المستحقون', 'الموارد البشرية', 'المحاسب'],
  }, companyName);
}

// ===== 7. تسوية نهاية الخدمة الكاملة (نموذج مطابق لتقارير التسوية النهائية) =====
export interface FinalSettlementDocData {
  employee: { name: string; code: string; department?: string | null; position?: string | null; nationality?: string | null; bankAccount?: string | null; manager?: string | null };
  hireDate: string;
  departureDate: string;
  reasonAr: string;
  basicSalary: number;
  stbSalary: number; // راتب المكافأة (آخر أجر)
  daysPaid: number;
  worthSalary: number;
  slices: { from: string; to: string; slice: number; workingDays: number; stbDays: number; percent: number; amount: number }[];
  servicePercent: number; // نسبة فترة الخدمة %
  eosAmount: number; // المكافأة المستحقة بعد النسبة
  stbBreakdown: { housing: number; social: number; provident: number; insurance: number };
  vacationDays: number;
  vacationAmount: number;
  loanDeduction: number;
  otherDues: number;
  deductions: number;
  totalDue: number;
  paidAmount: number;
}

export function finalSettlementDoc(s: FinalSettlementDocData, companyName = 'شركة ADMS'): string {
  const remaining = Math.round((s.totalDue - s.paidAmount) * 1000) / 1000;
  const pct = (p: number) => `${(p * 100).toFixed(3)}%`;
  const sliceRows = s.slices.map((x) =>
    `<tr><td class="num">${esc(fmtDate(x.from))}</td><td class="num">${esc(fmtDate(x.to))}</td>
     <td class="num">${x.slice}</td><td class="num">${x.workingDays.toFixed(3)}</td>
     <td class="num">${pct(x.percent)}</td><td class="num">${fmtKWD(x.amount)}</td></tr>`).join('');
  const slicesTotal = s.slices.reduce((a, b) => a + b.workingDays, 0);
  const slicesAmount = s.slices.reduce((a, b) => a + b.amount, 0);

  const infoCell = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v) || '—'}</td></tr>`;
  const numRow = (label: string, value: number, cls = '') =>
    `<tr><th>${esc(label)}</th><td class="num ${cls}">${fmtKWD(value)} د.ك</td></tr>`;

  const body = `
    <table>
      <tr>${infoCell('الرقم الوظيفي', s.employee.code)}${infoCell('اسم الموظف', s.employee.name)}</tr>
      <tr>${infoCell('تاريخ التعيين', s.hireDate)}${infoCell('تاريخ نهاية الخدمة', s.departureDate)}</tr>
      <tr>${infoCell('القسم', s.employee.department || '—')}${infoCell('الوظيفة', s.employee.position || '—')}</tr>
      <tr>${infoCell('الجنسية', s.employee.nationality || '—')}${infoCell('سبب النهاية', s.reasonAr)}</tr>
      <tr>${infoCell('المدير المباشر', s.employee.manager || '—')}${infoCell('الحساب البنكي', s.employee.bankAccount || '—')}</tr>
    </table>

    <p style="font-weight:800;color:#14523f">تفاصيل الراتب</p>
    <table>
      ${numRow('الراتب الأساسي', s.basicSalary)}
      ${numRow('إجمالي الراتب', s.stbSalary)}
      ${numRow('راتب المكافأة (STB Salary)', s.stbSalary)}
    </table>

    <p style="font-weight:800;color:#14523f">كشف المرتب — أيام مدفوعة حتى تاريخ النهاية</p>
    <table>
      <tr><th>الأيام المدفوعة</th><td class="num">${s.daysPaid.toFixed(3)}</td></tr>
      ${numRow('قيمة راتب الفترة', s.worthSalary)}
      ${numRow('أقساط قروض غير مسددة', s.loanDeduction)}
      <tr class="net"><th>صافي كشف المرتب</th><td class="num">${fmtKWD(Math.max(0, s.worthSalary - s.loanDeduction))} د.ك</td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">تعويض الإجازات غير المستخدمة</p>
    <table>
      <tr><th>أيام الإجازة المتبقية</th><td class="num">${s.vacationDays.toFixed(3)}</td></tr>
      ${numRow('تعويض الإجازات', s.vacationAmount)}
    </table>

    <p style="font-weight:800;color:#14523f">مكافأة نهاية الخدمة — شرائح الحساب بالأيام</p>
    <table>
      <tr><th>من</th><th>إلى</th><th>الشريحة</th><th>أيام العمل</th><th>نسبة الشريحة</th><th>المبلغ (د.ك)</th></tr>
      ${sliceRows}
      <tr><th colspan="3">الإجمالي</th><td class="num">${slicesTotal.toFixed(3)}</td><td class="num">—</td><td class="num">${fmtKWD(slicesAmount)}</td></tr>
    </table>
    <table>
      <tr><th>مجموع الشرائح (المكافأة الكاملة)</th><td class="num">${fmtKWD(slicesAmount)} د.ك</td></tr>
      <tr><th>نسبة فترة الخدمة</th><td class="num">${slicesAmount.toFixed(3)} × ${s.servicePercent.toFixed(3)}% = <b>${fmtKWD(s.eosAmount)}</b> د.ك</td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">تفصيل راتب المكافأة (STB Salary Breakdown)</p>
    <table>
      ${numRow('بدل سكن', s.stbBreakdown.housing)}
      ${numRow('بدل اجتماعي', s.stbBreakdown.social)}
      ${numRow('صندوق ائتمان / معاش', s.stbBreakdown.provident)}
      ${numRow('تأمين', s.stbBreakdown.insurance)}
      ${numRow('الراتب الأساسي', s.basicSalary)}
      <tr class="net"><th>إجمالي راتب المكافأة</th><td class="num">${fmtKWD(s.stbSalary)} د.ك</td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">إجمالي التسوية</p>
    <table>
      ${numRow('مكافأة نهاية الخدمة', s.eosAmount)}
      ${numRow('تعويض الإجازات', s.vacationAmount)}
      ${numRow('مستحقات أخرى', s.otherDues)}
      ${numRow('استقطاعات (قروض/غيرها)', -s.deductions)}
      <tr class="net"><th>الإجمالي المستحق</th><td class="num">${fmtKWD(s.totalDue)} د.ك</td></tr>
      ${numRow('المدفوع حتى الآن', s.paidAmount)}
      <tr class="net"><th>المتبقي للسداد</th><td class="num">${fmtKWD(Math.max(0, remaining))} د.ك</td></tr>
    </table>
    <div class="tafqit">فقط ${esc(tafqit(s.totalDue))}</div>`;
  return voucherDocHtml({
    title: 'تسوية نهاية الخدمة والمستحقات',
    refNo: `STL-${s.employee.code}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['الموظف / المستحقون', 'الموارد البشرية', 'المحاسب', 'المدير المالي'],
  }, companyName);
}

// ===== 8. تسوية الإجازة المقدمة (نموذج مطابق لعينة Vacation In-Advance Settlement) =====
export interface VacationSettlementDocData {
  employee: { name: string; code: string; department?: string | null; position?: string | null; nationality?: string | null; civilId?: string | null; bankAccount?: string | null };
  hireDate: string;
  basicSalary: number;
  totalSalary: number;
  leave: { from: string; to: string; days: number; typeName: string; returnDate?: string | null; dueDate?: string | null };
  balanceBefore: number;
  balanceAfter: number;
  annualQuota: number;
  rows: { month: string; workingDays: number; workingAmount: number; vacationDays: number; vacationAmount: number }[];
  workingAmountTotal: number;
  vacationAmountTotal: number;
  advanceTotal: number;
  notes?: string | null;
}

export function vacationSettlementDoc(s: VacationSettlementDocData, companyName = 'شركة ADMS'): string {
  const esc2 = esc;
  const monthName = (m: string) => {
    const [y, mm] = m.split('-');
    const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `${names[parseInt(mm, 10) - 1] || mm} / ${y}`;
  };
  const workRows = s.rows.filter((r) => r.workingDays > 0).map((r) =>
    `<tr><td>${esc2(monthName(r.month))}</td><td class="num">${r.workingDays.toFixed(3)}</td><td class="num">${fmtKWD(r.workingAmount)}</td><td>الراتب الأساسي</td></tr>`).join('');
  const vacRows = s.rows.filter((r) => r.vacationDays > 0).map((r) =>
    `<tr><td>${esc2(monthName(r.month))}</td><td class="num">${r.vacationDays.toFixed(3)}</td><td class="num">${fmtKWD(r.vacationAmount)}</td><td>الراتب الأساسي</td></tr>`).join('');
  const infoCell = (k: string, v: string) => `<tr><th>${esc2(k)}</th><td>${esc2(v) || '—'}</td></tr>`;

  const body = `
    <p style="font-weight:800;color:#14523f">بيانات الموظف</p>
    <table>
      <tr>${infoCell('الرقم الوظيفي', s.employee.code)}${infoCell('اسم الموظف', s.employee.name)}</tr>
      <tr>${infoCell('القسم', s.employee.department || '—')}${infoCell('الوظيفة', s.employee.position || '—')}</tr>
      <tr>${infoCell('الجنسية', s.employee.nationality || '—')}${infoCell('تاريخ التعيين', s.hireDate)}</tr>
      <tr>${infoCell('الراتب الأساسي', `${fmtKWD(s.basicSalary)} د.ك`)}${infoCell('إجمالي الراتب', `${fmtKWD(s.totalSalary)} د.ك`)}</tr>
      <tr>${infoCell('الحساب البنكي', s.employee.bankAccount || '—')}${infoCell('الرقم المدني', s.employee.civilId || '—')}</tr>
    </table>

    <p style="font-weight:800;color:#14523f">بيانات الإجازة</p>
    <table>
      <tr>${infoCell('من تاريخ', s.leave.from)}${infoCell('إلى تاريخ', s.leave.to)}</tr>
      <tr>${infoCell('نوع الإجازة', s.leave.typeName)}${infoCell('فترة الإجازة (أيام)', s.leave.days.toFixed(3))}</tr>
      <tr>${infoCell('تاريخ استئناف العمل', s.leave.returnDate || '—')}${infoCell('تاريخ الاستحقاق', s.leave.dueDate || '—')}</tr>
      <tr><th>الرصيد قبل الإجازة</th><td class="num">${s.balanceBefore.toFixed(3)} يوم</td>
          <th>الرصيد بعد الإجازة</th><td class="num">${s.balanceAfter.toFixed(3)} يوم</td></tr>
      <tr><th>حصة الإجازة السنوية</th><td class="num">${s.annualQuota.toFixed(0)} يوم</td><td></td><td></td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">أيام العمل قبل الإجازة</p>
    <table>
      <tr><th>الشهر</th><th>الأيام</th><th>المبلغ (د.ك)</th><th>النوع</th></tr>
      ${workRows || '<tr><td colspan="4">—</td></tr>'}
      <tr class="net"><th>الإجمالي</th><td class="num">${s.rows.reduce((a, b) => a + b.workingDays, 0).toFixed(3)}</td><td class="num">${fmtKWD(s.workingAmountTotal)}</td><td></td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">أيام الإجازة بالتفصيل</p>
    <table>
      <tr><th>الشهر</th><th>الأيام</th><th>المبلغ (د.ك)</th><th>النوع</th></tr>
      ${vacRows || '<tr><td colspan="4">—</td></tr>'}
      <tr class="net"><th>الإجمالي</th><td class="num">${s.rows.reduce((a, b) => a + b.vacationDays, 0).toFixed(3)}</td><td class="num">${fmtKWD(s.vacationAmountTotal)}</td><td></td></tr>
    </table>

    <p style="font-weight:800;color:#14523f">إجمالي التسوية المقدمة</p>
    <table>
      <tr><th>قيمة أيام العمل</th><td class="num">${fmtKWD(s.workingAmountTotal)} د.ك</td></tr>
      <tr><th>قيمة أيام الإجازة</th><td class="num">${fmtKWD(s.vacationAmountTotal)} د.ك</td></tr>
      <tr class="net"><th>إجمالي المقدّم المستحق</th><td class="num">${fmtKWD(s.advanceTotal)} د.ك</td></tr>
    </table>
    <div class="tafqit">فقط ${esc2(tafqit(s.advanceTotal))}</div>
    ${s.notes ? `<p>ملاحظات: ${esc2(s.notes)}</p>` : ''}`;
  return voucherDocHtml({
    title: 'تسوية الإجازة المقدمة',
    refNo: `VAC-${s.employee.code}-${Date.now().toString().slice(-6)}`,
    date: fmtDate(new Date()),
    body,
    signatures: ['الموظف', 'الموارد البشرية', 'المحاسب'],
  }, companyName);
}
