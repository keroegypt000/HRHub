// lib/client.ts — عميل API موحد: Bearer + كوكي، تنظيف 401 تلقائي
'use client';

export interface Me {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: Record<string, boolean> | null;
  can: Record<string, boolean>;
  employeeId?: string | null;
}

const IGNORE_401_UNTIL = Date.now() + 3000;

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sid');
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('sid', token);
  else localStorage.removeItem('sid');
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth401?: boolean } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    if (!options.skipAuth401 && Date.now() > IGNORE_401_UNTIL) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('hrhub:logout'));
    }
    throw new ApiError(401, 'غير مصرح');
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, `خطأ ${res.status}`);
    return (await res.blob()) as unknown as T;
  }
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || 'حدث خطأ');
  return data as T;
}

/** تنزيل ملف من مسار API مع مصادقة */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== تنسيقات =====
export function fmtKWD(n: number | null | undefined): string {
  const v = Math.round(Number(n || 0) * 1000) / 1000;
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  // نضيف إزاحة الكويت (+3) ثم نقتطع التاريخ — ليظهر اليوم الكويتي الصحيح
  const s = new Date(d);
  if (Number.isNaN(s.getTime())) return String(d).slice(0, 10);
  return new Date(s.getTime() + 180 * 60_000).toISOString().slice(0, 10);
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const s = new Date(d);
  const ms = s.getTime() + 180 * 60_000;
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** وقت HH:MM بتوقيت الكويت (UTC+3 ثابت) */
export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const s = new Date(d);
  const ms = s.getTime() + 180 * 60_000;
  return new Date(ms).toISOString().slice(11, 16);
}

export function fmtMinutes(min: number): string {
  if (!min) return '0د';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}س ${m}د` : `${m}د`;
}

export const STATUS_AR: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', half_day: 'نص يوم', absent: 'غائب',
  leave: 'في إجازة', holiday: 'عطلة رسمية', weekend: 'راحة أسبوعية',
  missed_punch: 'بصمة ناقصة',
  pending: 'بانتظار الموافقة', approved: 'معتمدة', rejected: 'مرفوضة', cancelled: 'ملغاة',
  active: 'نشط', suspended: 'موقوف', on_leave: 'في إجازة', terminated: 'منتهي الخدمة',
  draft: 'مسودة', computed: 'محسوبة', paid: 'مصروفة', expired: 'منتهي',
  full_time: 'دوام كامل', part_time: 'دوام جزئي', temporary: 'مؤقت', consultant: 'مستشار',
  online: 'متصل', offline: 'غير متصل', unknown: 'غير معروف',
  fixed: 'ثابتة', flexible: 'مرنة', auto: 'تلقائي',
  earning: 'مكمل', deduction: 'استقطاع',
  deceased: 'متوفى', partial: 'مدفوع جزئيًا',
  issued: 'مسلَّمة', returned: 'مُستلمة', lost: 'مفقودة', damaged: 'تالفة',
  resigned: 'استقالة', retired: 'تقاعد', contract_end: 'انتهاء عقد',
  admin: 'مدير النظام', hr: 'موارد بشرية', accountant: 'محاسب', supervisor: 'مشرف', viewer: 'مشاهد',
};

export const STATUS_COLORS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  late: 'bg-amber-100 text-amber-800 border-amber-200',
  half_day: 'bg-amber-50 text-amber-700 border-amber-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  leave: 'bg-blue-100 text-blue-700 border-blue-200',
  holiday: 'bg-gray-100 text-gray-600 border-gray-200',
  weekend: 'bg-gray-100 text-gray-500 border-gray-200',
  missed_punch: 'bg-orange-100 text-orange-700 border-orange-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  computed: 'bg-blue-100 text-blue-700 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
  terminated: 'bg-red-100 text-red-700 border-red-200',
  online: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  offline: 'bg-red-100 text-red-700 border-red-200',
  suspended: 'bg-amber-100 text-amber-800 border-amber-200',
  on_leave: 'bg-blue-100 text-blue-700 border-blue-200',
  deceased: 'bg-slate-200 text-slate-700 border-slate-300',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
};

/** أكواد حالة اليوم في سجل أيام القسيمة (dayLedger) */
export const LEDGER_AR: Record<string, string> = {
  p: 'حاضر', l: 'متأخر', h: 'نص يوم', a: 'غياب',
  lp: 'إجازة مدفوعة', lu: 'إجازة غير مدفوعة', ho: 'عطلة رسمية', we: 'راحة أسبوعية', m: 'بصمة ناقصة',
};

export const LEDGER_COLORS: Record<string, string> = {
  p: 'bg-emerald-500', l: 'bg-amber-500', h: 'bg-amber-300', a: 'bg-red-500',
  lp: 'bg-sky-500', lu: 'bg-blue-500', ho: 'bg-teal-600', we: 'bg-slate-300', m: 'bg-slate-400',
};
