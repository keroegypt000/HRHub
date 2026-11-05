'use client';

// معاينة التسوية من الخادم — نفس دالة الحفظ بالضبط (لا حساب مختلف في المتصفح)
import { useEffect, useState } from 'react';
import { api, fmtKWD } from '@/lib/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator } from 'lucide-react';
import { EOS_BASIS_OPTIONS, INDEMNITY_LAW } from '@/lib/indemnity';

export interface SettlementPreviewData {
  eosBasis: string; lastWage: number; monthlySalary: number;
  yearsServed: number; totalDays: number;
  indemnityFull: number; servicePercent: number; eosAmount: number;
  daysPaid: number; worthSalary: number;
  vacationDays: number; leaveAllowance: number;
  otherDues: number; deductions: number; loanDeduction: number; custodyDeduction?: number;
  custodyItems?: { itemName: string; status: string; amount: number }[];
  totalDue: number;
}

/** "" أو مسافات = تلقائي (null) — وإلا رقم */
export function numOrAuto(v: string): number | null {
  return v.trim() === '' ? null : Number(v) || 0;
}

/** يطلب المعاينة من الخادم بعد توقف الكتابة 400ms */
export function useSettlementPreview(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>) {
  const [data, setData] = useState<SettlementPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(body);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api<SettlementPreviewData>(url, { method, body: JSON.stringify({ ...JSON.parse(key), preview: true }) });
        if (!cancelled) { setData(res); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'تعذّر حساب المعاينة');
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [url, method, key]);
  return { data, error };
}

/** اختيار أساس المكافأة لهذه التسوية */
export function EosBasisSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block">أساس المكافأة</Label>
      <Select value={value || 'default'} onValueChange={onChange}>
        <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="default">حسب ملف الموظف / افتراضي الشركة</SelectItem>
          {EOS_BASIS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SettlementPreviewBox({ data, error, noHireDate }: { data: SettlementPreviewData | null; error: string | null; noHireDate?: boolean }) {
  const line = (label: string, v: number, sign = '') => (
    <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular">{sign}{fmtKWD(v)} د.ك</span></div>
  );
  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4 space-y-1.5 text-sm">
      <p className="font-bold flex items-center gap-2 mb-1"><Calculator className="h-4 w-4 text-emerald-600" /> معاينة الحساب ({INDEMNITY_LAW})</p>
      {noHireDate && <p className="text-red-700 text-xs font-bold">لا يوجد تاريخ تعيين — أدخله من صفحة الموظفين أولًا وإلا ستكون المكافأة صفرًا.</p>}
      {error && <p className="text-red-700 text-xs">{error}</p>}
      {!data ? <p className="text-muted-foreground text-xs">جارٍ الحساب...</p> : (
        <>
          <div className="flex justify-between"><span className="text-muted-foreground">مدة الخدمة</span><span className="tabular">{data.totalDays} يوم ({data.yearsServed.toFixed(2)} سنة)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">أجر المكافأة ({data.eosBasis === 'full_wage' ? 'أساسي + بدلات' : 'أساسي فقط'})</span><span className="tabular">{fmtKWD(data.lastWage)} د.ك</span></div>
          {line(`راتب شهر الترك (${data.daysPaid} يوم عمل)`, data.worthSalary, '+ ')}
          <div className="flex justify-between"><span className="text-muted-foreground">المكافأة كاملة × {data.servicePercent}%</span><span className="tabular">{fmtKWD(data.indemnityFull)} × {data.servicePercent}%</span></div>
          {line('المكافأة المستحقة', data.eosAmount, '+ ')}
          {line(`تعويض الإجازات (${data.vacationDays.toFixed(3)} يوم)`, data.leaveAllowance, '+ ')}
          {data.otherDues > 0 && line('مستحقات أخرى', data.otherDues, '+ ')}
          {data.deductions > 0 && line('استقطاعات', data.deductions, '− ')}
          {data.loanDeduction > 0 && line('أقساط قروض غير مسددة', data.loanDeduction, '− ')}
          {(data.custodyDeduction || 0) > 0 && line(`عهد غير مسلَّمة: ${(data.custodyItems || []).map((c) => c.itemName).join('، ')}`, data.custodyDeduction!, '− ')}
          <div className="flex justify-between border-t pt-1.5 mt-1">
            <span className="font-bold">صافي التسوية</span>
            <span className="tabular font-extrabold text-emerald-700 text-lg">{fmtKWD(data.totalDue)} د.ك</span>
          </div>
        </>
      )}
    </div>
  );
}
