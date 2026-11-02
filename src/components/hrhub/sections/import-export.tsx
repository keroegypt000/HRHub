'use client';

// الاستيراد والتصدير: قوالب جاهزة لكل كيان + رفع مع تقرير نجاح/فشل لكل صف + تصدير بفلاتر
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, downloadFile } from '@/lib/client';
import { PageHeader } from '@/components/hrhub/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';

const ENTITIES = [
  { key: 'employees', label: 'الموظفون' },
  { key: 'devices', label: 'الأجهزة' },
  { key: 'shifts', label: 'الورديات' },
  { key: 'holidays', label: 'العطلات' },
  { key: 'attendance-logs', label: 'سجل البصمة' },
  { key: 'salary-components', label: 'مكونات الراتب' },
] as const;

const EXPORTS = [
  { key: 'employees', label: 'الموظفون' },
  { key: 'devices', label: 'الأجهزة' },
  { key: 'shifts', label: 'الورديات' },
  { key: 'holidays', label: 'العطلات' },
  { key: 'attendance-logs', label: 'سجل البصمة' },
  { key: 'daily-attendance', label: 'الحضور اليومي' },
  { key: 'leaves', label: 'الإجازات' },
  { key: 'payroll', label: 'الرواتب' },
];

interface RowResult { row: number; ok: boolean; message: string }

export function ImportExportSection({ canWrite }: { canWrite: boolean }) {
  const [entity, setEntity] = useState<string>('employees');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ total: number; success: number; failed: number; results: RowResult[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    downloadFile(`/api/import/template?entity=${entity}`, `adms-template-${entity}.xlsx`);
    toast.info('نُزّل القالب — املأ الصفوف ثم ارفعه هنا');
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setResults(null);
    setProgress(5);
    try {
      // قراءة الملف في المتصفح عبر SheetJS ثم إرسال JSON إلى bulk API
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      setProgress(35);
      if (!rows.length) throw new Error('الملف لا يحتوي صفوفًا');

      // معالجة على دفعات لملفات الموظفين الضخمة مع شريط تقدم
      const BATCH = 300;
      const agg = { total: 0, success: 0, failed: 0, results: [] as RowResult[] };
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await api<{ total: number; success: number; failed: number; results: RowResult[] }>(
          `/api/import/excel?entity=${entity}`,
          { method: 'POST', body: JSON.stringify({ fileName: file.name, rows: chunk }) }
        );
        agg.total += res.total; agg.success += res.success; agg.failed += res.failed;
        agg.results.push(...res.results);
        setProgress(35 + Math.round(((i + chunk.length) / rows.length) * 60));
      }
      setResults(agg);
      toast.success(`استيراد مكتمل: ${agg.success} نجح / ${agg.failed} فشل من ${agg.total}`);
      window.dispatchEvent(new CustomEvent('hrhub:refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الاستيراد');
    } finally {
      setBusy(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doExport = (key: string) => {
    downloadFile(`/api/export?entity=${key}`, `adms-${key}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="الاستيراد والتصدير"
        subtitle="قوالب Excel جاهزة لكل كيان — استيراد جماعي بتقرير لكل صف (الصف الفاشل لا يوقف غيره)، وتصدير أي قسم"
      />

      <div className="grid md:grid-cols-2 gap-4">
        {/* الاستيراد */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-emerald-700" /> استيراد Excel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {ENTITIES.map((e) => (
                <button
                  key={e.key}
                  onClick={() => setEntity(e.key)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${entity === e.key ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-800' : 'hover:border-emerald-300'}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> تنزيل القالب
              </Button>
              {canWrite && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" /> رفع الملف واستيراده
                  </Button>
                  <input
                    ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                  />
                </>
              )}
            </div>
            {busy && (
              <div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">جارٍ المعالجة على دفعات... {progress}%</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              الاستيراد لا يفسد القائم: الصفوف المتطابقة تُحدَّث لا تُكرَّر، وقراءة الملف داخل المتصفح ثم تنفيذ جماعي في السيرفر.
            </p>

            {/* تقرير النتائج لكل صف */}
            {results && (
              <div className="rounded-lg border p-3 space-y-2 max-h-72 overflow-y-auto">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3 ml-1" /> نجح: {results.success}</Badge>
                  <Badge variant="outline" className="bg-red-50 text-red-700"><XCircle className="h-3 w-3 ml-1" /> فشل: {results.failed}</Badge>
                  <Badge variant="outline">الإجمالي: {results.total}</Badge>
                </div>
                {results.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs border-b pb-1 last:border-0">
                    {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                    <span className="tabular text-muted-foreground shrink-0">صف {r.row}</span>
                    <span className={r.ok ? '' : 'text-red-700'}>{r.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* التصدير */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-700" /> تصدير Excel</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.key} variant="outline" size="sm" className="justify-start" onClick={() => doExport(e.key)}>
                <Download className="h-4 w-4" /> {e.label}
              </Button>
            ))}
            <p className="col-span-2 text-xs text-muted-foreground pt-1">
              للتصدير بفلاتر محددة (فترة/قسم/حالة) استخدم زر التصدير داخل كل قسم — يطبق الفلاتر نفسها.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
