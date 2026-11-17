// هوية الشركة في كل المطبوعات: اللوجو + بيانات الشركة + شكل الترويسة + اللون + الخط
// تُحمَّل مرة عند فتح البرنامج وبعد حفظ الإعدادات، وتُستخدم بشكل متزامن عند الطباعة
import { api } from '@/lib/client';

export type ReportStyle = 'classic' | 'modern' | 'minimal';
export interface Branding {
  companyName: string; companyNameEn: string; address: string; phone: string; email: string; crNo: string;
  style: ReportStyle; color: string; showLogo: boolean; logo: string | null;
}

const DEFAULT: Branding = {
  companyName: 'الشركة', companyNameEn: '', address: '', phone: '', email: '', crNo: '',
  style: 'classic', color: '#1F8A70', showLogo: true, logo: null,
};
let current: Branding = DEFAULT;

export const getBranding = (): Branding => current;
export async function loadBranding(): Promise<Branding> {
  try { current = { ...DEFAULT, ...(await api<Partial<Branding>>('/api/branding', { skipAuth401: true })) }; } catch { /* يبقى الافتراضي */ }
  return current;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** لون أفتح من لون الهوية (للخلفيات الخفيفة) */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** CSS المطبوعات: الخط المضمّن + ألوان الهوية + أشكال الترويسة الثلاثة */
export function brandCss(b: Branding = current): string {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const faces = [400, 500, 700].map((w) => `
    @font-face{font-family:'HR Plex Arabic';font-weight:${w};src:url('${origin}/fonts/plex-arabic-arabic-${w}.woff2') format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC}
    @font-face{font-family:'HR Plex Arabic';font-weight:${w};src:url('${origin}/fonts/plex-arabic-latin-${w}.woff2') format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122}`).join('');
  return `${faces}
  :root{--brand:${b.color};--brand-soft:${tint(b.color, 0.9)};--brand-mid:${tint(b.color, 0.75)}}
  body{font-family:'HR Plex Arabic',Tahoma,'Segoe UI',sans-serif !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lh{display:flex;align-items:center;gap:14px;margin-bottom:10px}
  .lh .lh-logo{height:58px;max-width:150px;object-fit:contain}
  .lh .lh-names{flex:1;min-width:0}
  .lh .lh-ar{font-size:18px;font-weight:700;line-height:1.3}
  .lh .lh-en{font-size:12px;letter-spacing:.3px;direction:ltr;text-align:right;opacity:.85}
  .lh .lh-info{font-size:10.5px;line-height:1.7;text-align:left;opacity:.9}
  .lh-title{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:0 0 8px}
  .lh-title h1{font-size:16px;margin:0;font-weight:700;color:var(--brand)}
  .lh-title .lh-meta{font-size:11px;color:#555}
  /* كلاسيكي: شريط ملون */
  .lh.classic{background:var(--brand);color:#fff;padding:12px 16px;border-radius:8px}
  .lh.classic .lh-logo{background:#fff;border-radius:8px;padding:5px}
  /* حديث: أبيض مع خط ملون سميك */
  .lh.modern{padding:4px 0 12px;border-bottom:3px solid var(--brand)}
  .lh.modern .lh-ar{color:var(--brand);font-size:20px}
  .lh.modern .lh-info{color:#444}
  /* بسيط: في المنتصف وأبيض وأسود */
  .lh.minimal{flex-direction:column;text-align:center;gap:4px;padding-bottom:10px;border-bottom:1px solid #999}
  .lh.minimal .lh-en{text-align:center}
  .lh.minimal .lh-info{text-align:center}
  .lh.minimal + .lh-title h1{color:#111}
  .brand-foot{margin-top:14px;padding-top:6px;border-top:1px solid #ccc;font-size:9.5px;color:#666;display:flex;justify-content:space-between;gap:8px}
  thead th,.brand-th{background:var(--brand-soft) !important;color:#111}
  tfoot th{background:var(--brand-mid) !important}`;
}

/** الترويسة: اللوجو واسم الشركة بالعربي والإنجليزي وبياناتها */
export function letterhead(b: Branding = current): string {
  const ltr = (v: string) => `<span dir="ltr">${esc(v)}</span>`; // الأرقام والإيميل بنفس ترتيبها
  const info = [b.address && esc(b.address), b.phone && `هاتف: ${ltr(b.phone)}`, b.email && ltr(b.email), b.crNo && `س.ت: ${ltr(b.crNo)}`].filter(Boolean).join('<br>');
  const logo = b.showLogo && b.logo ? `<img class="lh-logo" src="${b.logo}" alt="">` : '';
  return `<div class="lh ${b.style}">${logo}<div class="lh-names"><div class="lh-ar">${esc(b.companyName)}</div>${b.companyNameEn ? `<div class="lh-en">${esc(b.companyNameEn)}</div>` : ''}</div>${info ? `<div class="lh-info">${info}</div>` : ''}</div>`;
}

/** عنوان المستند تحت الترويسة */
export function docTitle(title: string, meta = ''): string {
  return `<div class="lh-title"><h1>${esc(title)}</h1>${meta ? `<span class="lh-meta">${meta}</span>` : ''}</div>`;
}

/** تذييل: اسم الشركة وتاريخ الطباعة */
export function brandFooter(b: Branding = current): string {
  const d = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  return `<div class="brand-foot"><span>${esc(b.companyName)}${b.companyNameEn ? ` — ${esc(b.companyNameEn)}` : ''}</span><span>تاريخ الطباعة: <span dir="ltr">${d}</span></span></div>`;
}
