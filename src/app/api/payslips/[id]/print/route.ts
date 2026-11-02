import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, fail, handle } from '@/lib/api';
import { tafqitKWD } from '@/lib/tafqit';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtKWD(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function fmtDateStr(d: Date | string | null): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/** قالب موحد مطبوع بهوية HRHub — نفس نظام print-docs في الواجهة */
function payslipPrintHtml(slip: {
  basicSalary: number; totalEarnings: number; totalDeductions: number; netPay: number;
  workedDays: number; absenceDays: number; lateMinutes: number; otHours: number;
  items: { name: string; type: string; amount: number; note?: string | null }[];
  employee: { name: string; code: string; civilId?: string | null; bankAccount?: string | null; nationality?: string | null; department?: { name: string } | null; position?: { name: string } | null };
  period: { name: string; startDate: Date; endDate: Date };
}, companyName: string): string {
  const earnings = slip.items.filter((i) => i.type === 'earning');
  const deductions = slip.items.filter((i) => i.type === 'deduction');
  const maxLen = Math.max(earnings.length, deductions.length, 1);
  const rows = Array.from({ length: maxLen }).map((_, idx) => {
    const e = earnings[idx]; const d = deductions[idx];
    return `<tr><td>${esc(e?.name || '')}</td><td class="num">${e ? fmtKWD(e.amount) : ''}</td><td>${esc(d?.name || '')}</td><td class="num">${d ? fmtKWD(d.amount) : ''}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>قسيمة راتب ${esc(slip.employee.name)} — ${esc(slip.period.name)}</title>
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
</style></head>
<body><div class="doc">
  <div class="head">
    <div class="logo"><div class="mark">HR</div><div>${esc(companyName)}<div style="font-size:11px;font-weight:400;opacity:.85">HRHub — الموارد البشرية والحضور والرواتب</div></div></div>
    <div class="meta">رقم المرجع: <b>PS-${esc(slip.period.name)}-${esc(slip.employee.code)}</b><br>التاريخ: <b>${fmtDateStr(new Date())}</b></div>
  </div>
  <div class="title">قسيمة راتب</div>
  <div class="body">
    <table>
      <tr><th style="width:25%">الموظف</th><td>${esc(slip.employee.name)} (${esc(slip.employee.code)})</td><th style="width:20%">الفترة</th><td>${esc(slip.period.name)}</td></tr>
      <tr><th>القسم</th><td>${esc(slip.employee.department?.name || '—')}</td><th>المسمى</th><td>${esc(slip.employee.position?.name || '—')}</td></tr>
      <tr><th>الرقم المدني</th><td>${esc(slip.employee.civilId || '—')}</td><th>الحساب البنكي</th><td>${esc(slip.employee.bankAccount || '—')}</td></tr>
      <tr><th>الجنسية</th><td>${esc(slip.employee.nationality || '—')}</td><th>فترة الاحتساب</th><td>${fmtDateStr(slip.period.startDate)} → ${fmtDateStr(slip.period.endDate)}</td></tr>
    </table>
    <table>
      <thead><tr><th>المكملات</th><th style="width:18%">مبلغ (د.ك)</th><th>الاستقطاعات</th><th style="width:18%">مبلغ (د.ك)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><th>إجمالي المكملات</th><td class="num">${fmtKWD(slip.totalEarnings)}</td><th>إجمالي الاستقطاعات</th><td class="num">${fmtKWD(slip.totalDeductions)}</td></tr>
        <tr class="net"><td colspan="2">صافي الراتب المستحق</td><td colspan="2" class="num">${fmtKWD(slip.netPay)} د.ك</td></tr>
      </tfoot>
    </table>
    <div class="tafqit">فقط ${esc(tafqitKWD(slip.netPay))}</div>
    <p style="font-size:12px;color:#557">
      أيام العمل ${slip.workedDays} — أيام الغياب ${slip.absenceDays} · تأخير ${slip.lateMinutes} دقيقة · إضافي ${slip.otHours} ساعة ·
      الراتب الأساسي ${fmtKWD(slip.basicSalary)} د.ك · العملة: دينار كويتي ثلاث خانات عشرية.
    </p>
  </div>
  <div class="signs">
    <div class="sign"><b>الموظف</b><div class="line">الاسم والتوقيع</div></div>
    <div class="sign"><b>الموارد البشرية</b><div class="line">الاسم والتوقيع</div></div>
    <div class="sign"><b>الختم</b><div class="line">&nbsp;</div></div>
  </div>
  <div class="foot">قسيمة راتب ${esc(slip.period.name)} — سريّة بين الموظف والجهة · صادر آليًا من نظام HRHub — دولة الكويت</div>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body></html>`;
}

/** GET /api/payslips/[id]/print — قسيمة مطبوعة HTML للطباعة إلى PDF من المتصفح */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireRead(req, 'payslips');
    const { id } = await ctx.params;
    const slip = await db.payslip.findUnique({
      where: { id },
      include: {
        employee: { include: { department: true, position: true } },
        period: true,
        items: { orderBy: { id: 'asc' } },
      },
    });
    if (!slip) return fail(404, 'القسيمة غير موجودة');
    const { getSettings } = await import('@/lib/settings');
    const settings = await getSettings();
    const html = payslipPrintHtml(slip as never, settings.companyName || 'شركة HRHub');
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
}
