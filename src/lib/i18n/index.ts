// لغة الواجهة: العربية (الأصل) أو الإنجليزية — اختيار كل مستخدم محفوظ على جهازه
// الترجمة تتم على النص المعروض نفسه (القاموس en.ts)، فكل الشاشات والرسائل تُترجم بدون تعديلها واحدة واحدة.
import { EN_EXACT, EN_PATTERNS } from './en';

export type Lang = 'ar' | 'en';
const KEY = 'hrhub-lang';
const AR = /[؀-ۿ]/;

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'ar';
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* تجاهل */ }
  window.location.reload();
}

// قوالب نصها الثابت قصير جدًا (مثل «{0}د» للدقائق) لا تُطبق إلا على قيم رقمية — حتى لا تتشوه كلمات عربية قصيرة
const compiled = EN_PATTERNS.map(([rx, repl]) => {
  const fixed = rx.replace(/\(\.\+\?\)/g, '').replace(/[\^$]/g, '');
  return [new RegExp(rx), repl, (fixed.match(/[؀-ۿ]/g) || []).length < 3] as const;
});
const cache = new Map<string, string>();
// فواصل شائعة داخل الجمل المركبة: نترجم كل جزء على حدة
const SEPARATORS = [' — ', ' · ', ' ← ', ' → ', ' | ', '، ', ': ', ' - '];

function translateCore(s: string, depth = 0): string {
  const exact = EN_EXACT[s];
  if (exact !== undefined) return exact;
  for (const [rx, repl, numericOnly] of compiled) {
    const m = s.match(rx);
    if (m && numericOnly && m.slice(1).some((v) => AR.test(v))) continue;
    if (m) {
      // القيم المتغيرة نفسها قد تكون نصًا عربيًا (اسم حالة مثلًا) — تُترجم أيضًا
      return repl.replace(/\$(\d+)/g, (_, n) => {
        const v = m[Number(n)] ?? '';
        return depth < 2 && AR.test(v) ? translateCore(v.trim(), depth + 1) : v;
      });
    }
  }
  if (depth < 3) {
    for (const sep of SEPARATORS) {
      if (s.includes(sep)) {
        const parts = s.split(sep);
        const out = parts.map((p) => (AR.test(p) ? translateCore(p.trim(), depth + 1) : p));
        if (out.some((p, i) => p !== parts[i])) return out.join(sep === '، ' ? ', ' : sep);
      }
    }
  }
  return s;
}

/** ترجمة نص معروض (يحافظ على المسافات حوله) */
export function tr(text: string): string {
  if (!text || !AR.test(text)) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = text.trim().replace(/\s+/g, ' ');
  // كلمة عربية من حرفين أو أقل بلا ترجمة مباشرة = اختصار (مثل الأحرف الأولى للاسم) — تبقى كما هي
  if (core.length <= 2 && EN_EXACT[core] === undefined) { cache.set(text, text); return text; }
  const out = lead + translateCore(core) + trail;
  cache.set(text, out);
  return out;
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const v = node.nodeValue || '';
    if (AR.test(v)) {
      const t = tr(v);
      if (t !== v) node.nodeValue = t;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
  if (el.closest('[data-no-translate]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && AR.test(v)) {
      const t = tr(v);
      if (t !== v) el.setAttribute(a, t);
    }
  }
  if (tag === 'INPUT' && (el as HTMLInputElement).type === 'button') {
    const v = (el as HTMLInputElement).value;
    if (AR.test(v)) (el as HTMLInputElement).value = tr(v);
  }
  el.childNodes.forEach(translateNode);
}

/** تشغيل الترجمة الحية للصفحة (يُستدعى مرة واحدة عند اختيار الإنجليزية) */
export function startLiveTranslation(): () => void {
  const html = document.documentElement;
  html.lang = 'en';
  html.dir = 'ltr';
  document.title = tr(document.title);
  translateNode(document.body);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}
