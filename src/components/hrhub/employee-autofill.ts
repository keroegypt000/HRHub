// تعبئة نموذج المستند من ملف الموظف بمجرد اختياره (جواز / إقامة)
import { api, fmtDate } from '@/lib/client';

interface EmpDocs {
  name: string; nationality?: string | null; passportNo?: string | null; civilId?: string | null;
}

export function employeeAutofill(kind: 'passport' | 'iqama') {
  return async (key: string, value: unknown): Promise<Record<string, unknown> | void> => {
    if (key !== 'employeeId' || !value) return;
    const e = await api<EmpDocs>(`/api/employees/${value}`);
    const patch: Record<string, unknown> = { holderName: e.name, nationality: e.nationality || '' };
    if (kind === 'passport') {
      patch.passportNo = e.passportNo || '';
      const p = await api<{ rows: { passportNo: string; issueDate?: string | null; expiryDate: string; employee?: { id: string } | null }[] }>(`/api/passports?search=${encodeURIComponent(e.passportNo || e.name)}&limit=20`).catch(() => ({ rows: [] }));
      const last = p.rows.find((r) => r.employee?.id === value);
      if (last) { patch.issueDate = last.issueDate ? fmtDate(last.issueDate) : ''; patch.expiryDate = fmtDate(last.expiryDate); }
    } else {
      patch.iqamaNo = e.civilId || '';
    }
    return patch;
  };
}
