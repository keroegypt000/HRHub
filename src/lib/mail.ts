// lib/mail.ts — إرسال إشعارات الموافقات بالبريد عبر SMTP (الإعدادات من شاشة الإعدادات)
// الإرسال لا يُفشل العملية الأصلية أبدًا: أي خطأ يُسجل في التدقيق فقط
import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { getSettings, decryptSecret, SystemSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';
import { requestTypeLabel, REQUEST_STATUS_AR, RequestStep } from '@/lib/requests';

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
}

function transportFor(s: SystemSettings) {
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort || 587,
    secure: s.smtpSecure,
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPasswordEnc ? decryptSecret(s.smtpPasswordEnc) : '' } : undefined,
    connectionTimeout: 10_000,
  });
}

const isEmail = (v: string | null | undefined): v is string => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** إرسال رسالة — يرجع false بصمت إن كان البريد معطلًا أو لا يوجد مستلمون */
export async function sendMail(msg: MailMessage, opts: { force?: boolean } = {}): Promise<boolean> {
  const s = await getSettings();
  if ((!s.emailEnabled && !opts.force) || !s.smtpHost) return false;
  const to = [...new Set(msg.to.filter(isEmail).map((x) => x.trim().toLowerCase()))];
  if (!to.length) return false;
  await transportFor(s).sendMail({
    from: s.smtpFrom || s.smtpUser,
    to: to.join(', '),
    subject: msg.subject,
    html: msg.html,
  });
  return true;
}

/** غلاف آمن: لا يرمي أبدًا — يسجل الفشل في التدقيق */
export async function sendMailSafe(msg: MailMessage, context: string): Promise<void> {
  try {
    await sendMail(msg);
  } catch (err) {
    await logAudit({
      action: 'email', entity: 'email',
      description: `تعذّر إرسال بريد (${context}): ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    }).catch(() => {});
  }
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function layout(title: string, body: string, appUrl: string, company: string): string {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #d1fae5;border-radius:12px;overflow:hidden">
  <div style="background:#059669;color:#fff;padding:14px 18px;font-weight:bold">${esc(company)}</div>
  <div style="padding:18px;color:#111;line-height:1.8">
    <h3 style="margin:0 0 10px">${esc(title)}</h3>${body}
    ${appUrl ? `<p style="margin-top:18px"><a href="${esc(appUrl)}" style="background:#059669;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">فتح النظام</a></p>` : ''}
  </div></div>`;
}

interface RequestLite {
  id: string; type: string; status: string; payload: string | null; unitKey: string | null;
  employee: { name: string; code: string; email: string | null };
}

function payloadSummary(payload: string | null): string {
  try {
    const p = JSON.parse(payload || '{}') as Record<string, unknown>;
    const parts: string[] = [];
    if (p.fromDate) parts.push(`من ${esc(String(p.fromDate).slice(0, 10))}`);
    if (p.toDate) parts.push(`إلى ${esc(String(p.toDate).slice(0, 10))}`);
    if (p.amount) parts.push(`المبلغ ${esc(p.amount)} د.ك`);
    if (p.installments) parts.push(`${esc(p.installments)} قسط`);
    if (p.description) parts.push(esc(p.description));
    if (p.purpose) parts.push(esc(p.purpose));
    return parts.join(' — ');
  } catch {
    return '';
  }
}

/** طلب ينتظر موافقة مستخدم — يُرسل لصاحب المستوى الحالي */
export async function notifyApprover(request: RequestLite, step: RequestStep, level: number): Promise<void> {
  const s = await getSettings();
  if (!s.emailEnabled) return;
  const approver = await db.user.findUnique({ where: { id: step.userId }, select: { email: true, employee: { select: { email: true } } } });
  const to = [approver?.email, approver?.employee?.email].filter((x): x is string => !!x);
  const html = layout(
    `طلب ${requestTypeLabel(request.type)} بانتظار موافقتك`,
    `<p>الموظف: <b>${esc(request.employee.name)}</b> (${esc(request.employee.code)})${request.unitKey ? ` — ${esc(request.unitKey)}` : ''}</p>
     <p>${payloadSummary(request.payload)}</p>
     <p>المستوى المطلوب منك: <b>${level}</b></p>`,
    s.appUrl, s.companyName,
  );
  await sendMailSafe({ to, subject: `طلب ${requestTypeLabel(request.type)} بانتظار موافقتك — ${request.employee.name}`, html }, `موافقة طلب ${request.id}`);
}

/** القرار النهائي — للموظف ولإيميل الإشعار المضبوط في سلسلة الموافقة */
export async function notifyDecision(request: RequestLite, comment?: string): Promise<void> {
  const s = await getSettings();
  if (!s.emailEnabled) return;
  const cfg = await db.workflowConfig.findMany({ where: { requestType: request.type } });
  const wf = cfg.find((c) => c.unitKey === (request.unitKey || 'ALL')) || cfg.find((c) => c.unitKey === 'ALL');
  const to = [request.employee.email, ...(wf?.notifyEmail || '').split(/[,;\s]+/)].filter((x): x is string => !!x);
  const statusAr = REQUEST_STATUS_AR[request.status] || request.status;
  const html = layout(
    `تم ${statusAr === 'معتمد' ? 'اعتماد' : 'رفض'} طلب ${requestTypeLabel(request.type)}`,
    `<p>الموظف: <b>${esc(request.employee.name)}</b> (${esc(request.employee.code)})</p>
     <p>${payloadSummary(request.payload)}</p>
     <p>الحالة: <b>${esc(statusAr)}</b></p>${comment ? `<p>ملاحظة: ${esc(comment)}</p>` : ''}`,
    s.appUrl, s.companyName,
  );
  await sendMailSafe({ to, subject: `${statusAr}: طلب ${requestTypeLabel(request.type)} — ${request.employee.name}`, html }, `قرار طلب ${request.id}`);
}
