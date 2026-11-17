'use client';

// هوية الشركة في التقارير: رفع اللوجو، بيانات الترويسة، شكل التقارير، اللون — مع معاينة
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { loadBranding, brandCss, letterhead, docTitle, brandFooter, Branding, ReportStyle } from '@/lib/branding';
import { printHtml } from '@/components/hrhub/print-docs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Eye, Save, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Form {
  companyName: string; companyNameEn: string; companyAddress: string; companyPhone: string; companyEmail: string; companyCrNo: string;
  companyLogoFileId: string; reportStyle: ReportStyle; reportColor: string; reportShowLogo: boolean;
}

const COLORS = ['#1F8A70', '#0F4C81', '#1E3A5F', '#7A1F2B', '#8A5A00', '#4B2E83', '#2F3B45', '#0B6E4F'];
const STYLES: { key: ReportStyle; label: string; desc: string }[] = [
  { key: 'classic', label: 'كلاسيكي', desc: 'شريط بلون الشركة' },
  { key: 'modern', label: 'حديث', desc: 'خلفية بيضاء وخط ملون' },
  { key: 'minimal', label: 'بسيط', desc: 'متوسّط ومناسب للطباعة بالأبيض والأسود' },
];

function StylePreview({ style, color, logo }: { style: ReportStyle; color: string; logo: string | null }) {
  const mark = logo
    ? <img src={logo} alt="" className={cn('h-5 max-w-12 object-contain', style === 'classic' && 'rounded bg-white p-0.5')} />
    : <div className={cn('h-5 w-5 rounded', style === 'classic' ? 'bg-white/90' : '')} style={style === 'classic' ? undefined : { background: color }} />;
  return (
    <div className="h-20 overflow-hidden rounded border bg-white p-1.5">
      {style === 'classic' && <div className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: color }}>{mark}<div className="h-1.5 w-14 rounded bg-white/90" /></div>}
      {style === 'modern' && <div className="flex items-center gap-1.5 border-b-2 pb-1" style={{ borderColor: color }}>{mark}<div className="h-2 w-16 rounded" style={{ background: color }} /></div>}
      {style === 'minimal' && <div className="flex flex-col items-center gap-0.5 border-b pb-1">{mark}<div className="h-1.5 w-14 rounded bg-slate-700" /></div>}
      <div className="mt-1.5 space-y-1">{[0, 1, 2].map((i) => <div key={i} className="h-1 rounded bg-slate-200" style={{ width: `${90 - i * 15}%` }} />)}</div>
    </div>
  );
}

export function BrandingSettingsCard() {
  const [f, setF] = useState<Form | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Form>('/api/settings').then((s) => setF({
      companyName: s.companyName || '', companyNameEn: s.companyNameEn || '', companyAddress: s.companyAddress || '',
      companyPhone: s.companyPhone || '', companyEmail: s.companyEmail || '', companyCrNo: s.companyCrNo || '',
      companyLogoFileId: s.companyLogoFileId || '', reportStyle: s.reportStyle || 'classic', reportColor: s.reportColor || '#1F8A70',
      reportShowLogo: s.reportShowLogo !== false,
    })).catch(() => {});
    loadBranding().then((b) => setLogo(b.logo)).catch(() => {});
  }, []);
  if (!f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });

  const uploadLogo = async (file: File) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast.error('يجب أن يكون الشعار صورة PNG أو JPG أو SVG'); return; }
    if (file.size > 1024 * 1024) { toast.error('حجم الشعار أكبر من 1 ميجابايت'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('ownerTag', 'company_logo');
    const token = localStorage.getItem('sid');
    const res = await fetch('/api/files/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error || 'تعذّر رفع الشعار'); return; }
    set('companyLogoFileId', d.id);
    setLogo(await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(file); }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(f) });
      await loadBranding();
      window.dispatchEvent(new Event('hrhub:refresh'));
      toast.success('تم حفظ هوية الشركة وتطبيقها على التقارير والمطبوعات');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    const b: Branding = {
      companyName: f.companyName || 'الشركة', companyNameEn: f.companyNameEn, address: f.companyAddress, phone: f.companyPhone,
      email: f.companyEmail, crNo: f.companyCrNo, style: f.reportStyle, color: f.reportColor, showLogo: f.reportShowLogo, logo,
    };
    const rows = [['1001', 'أحمد محمد', 'المبيعات', '22', '0:45', '6:30'], ['1002', 'سارة علي', 'الحدائق', '21', '—', '2:15'], ['1003', 'محمود حسن', 'المبيعات', '23', '1:10', '—']];
    printHtml(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>معاينة شكل التقارير</title><style>${brandCss(b)}
      body{margin:18px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:6px;text-align:center}.meta{font-size:11px;color:#555;margin:0 0 8px}</style></head><body>
      ${letterhead(b)}${docTitle('تقرير الحضور الشهري (معاينة)', 'الفترة: 2026-11-01 → 2026-11-30')}
      <p class="meta">القسم: كل الأقسام · الموظف: كل الموظفين</p>
      <table><thead><tr><th>الرقم</th><th>الموظف</th><th>القسم</th><th>أيام الحضور</th><th>التأخير</th><th>الإضافي</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3">الإجمالي</th><th>66</th><th>1:55</th><th>8:45</th></tr></tfoot></table>${brandFooter(b)}</body></html>`);
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" /> هوية الشركة وشكل التقارير</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-40 items-center justify-center rounded-lg border bg-white p-2">
            {logo ? <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">لا يوجد شعار</span>}
          </div>
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <ImagePlus className="h-4 w-4" /> {logo ? 'تغيير الشعار' : 'رفع شعار الشركة'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) uploadLogo(x); e.target.value = ''; }} />
            </label>
            {logo && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { set('companyLogoFileId', ''); setLogo(null); }}><Trash2 className="h-4 w-4" /> إزالة الشعار</Button>}
            <p className="text-xs text-muted-foreground">يُفضّل PNG بخلفية شفافة، بحد أقصى 1 ميجابايت</p>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.reportShowLogo} onCheckedChange={(v) => set('reportShowLogo', v)} /> إظهار الشعار في التقارير</label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label className="mb-1.5">اسم الشركة بالعربي</Label><Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} /></div>
          <div><Label className="mb-1.5">اسم الشركة بالإنجليزي</Label><Input value={f.companyNameEn} onChange={(e) => set('companyNameEn', e.target.value)} dir="ltr" /></div>
          <div><Label className="mb-1.5">العنوان</Label><Input value={f.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} /></div>
          <div><Label className="mb-1.5">الهاتف</Label><Input value={f.companyPhone} onChange={(e) => set('companyPhone', e.target.value)} dir="ltr" /></div>
          <div><Label className="mb-1.5">البريد الإلكتروني</Label><Input value={f.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} dir="ltr" /></div>
          <div><Label className="mb-1.5">رقم السجل التجاري</Label><Input value={f.companyCrNo} onChange={(e) => set('companyCrNo', e.target.value)} /></div>
        </div>

        <div>
          <Label className="mb-2 block">شكل ترويسة التقارير</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {STYLES.map((st) => (
              <button key={st.key} type="button" onClick={() => set('reportStyle', st.key)}
                className={cn('rounded-lg border p-2 text-right transition', f.reportStyle === st.key ? 'border-emerald-600 ring-2 ring-emerald-600/30' : 'hover:border-emerald-400')}>
                <StylePreview style={st.key} color={f.reportColor} logo={f.reportShowLogo ? logo : null} />
                <p className="mt-1.5 text-sm font-bold">{st.label}</p>
                <p className="text-[11px] text-muted-foreground">{st.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">لون الهوية</Label>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set('reportColor', c)} title={c}
                className={cn('h-8 w-8 rounded-full border-2', f.reportColor.toLowerCase() === c.toLowerCase() ? 'border-slate-900 ring-2 ring-offset-1' : 'border-white shadow')}
                style={{ background: c }} />
            ))}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              لون آخر <input type="color" value={f.reportColor} onChange={(e) => set('reportColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy}><Save className="h-4 w-4" /> {busy ? 'جاري الحفظ...' : 'حفظ الهوية'}</Button>
          <Button variant="outline" onClick={preview}><Eye className="h-4 w-4" /> معاينة تقرير</Button>
        </div>
      </CardContent>
    </Card>
  );
}
