// lib/zk/biotime.ts — عميل REST لسحب البيانات من خادم BioTime 8.5/9.5 قائم
// POST /jwt-api-token-auth/ → { token } ثم Authorization: JWT <token>
// يجلب: employees، area، device، transaction — بترقيم صفحات حتى الاستنفاد

export interface BioTimeCreds {
  url: string;
  username: string;
  password: string;
}

export interface BioTimeEmployee {
  id: number | string;
  emp_code?: string;
  emp_full_name?: string;
  first_name?: string;
  last_name?: string;
  department?: string | number;
  position?: string | number;
  area?: string | number;
  hiring_date?: string;
  [key: string]: unknown;
}

export interface BioTimeTransaction {
  id: number | string;
  emp_code?: string;
  emp_id?: number | string;
  punch_time?: string;
  punch_state?: number | string;
  verify_type?: number | string;
  terminal_sn?: string;
  work_code?: string;
  [key: string]: unknown;
}

export interface BioTimeDevice {
  id: number | string;
  serial_number?: string;
  device_name?: string;
  alias?: string;
  ip_address?: string;
  last_activity?: string;
  device_type?: string;
  state?: string | number;
  [key: string]: unknown;
}

async function btFetch(url: string, path: string, token: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${url.replace(/\/$/, '')}${path}${qs}`, {
    headers: { Authorization: `JWT ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BioTime API ${path} فشل: ${res.status}`);
  return res.json();
}

async function fetchAllPages<T>(
  url: string,
  path: string,
  token: string,
  extra?: Record<string, string>
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const data = (await btFetch(url, path, token, {
      page_size: '1000',
      page: String(page),
      ...extra,
    })) as { data?: T[]; count?: number; results?: T[] };
    const rows = data.data || data.results || [];
    if (Array.isArray(rows)) out.push(...rows);
    if (!rows || rows.length < 1000) break;
    page++;
    if (page > 100) break; // حماية
  }
  return out;
}

export async function btLogin(creds: BioTimeCreds): Promise<string> {
  const res = await fetch(`${creds.url.replace(/\/$/, '')}/jwt-api-token-auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`فشل تسجيل الدخول إلى BioTime: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('لم يُعد BioTime توكن صالح');
  return data.token;
}

export async function btEmployees(url: string, token: string): Promise<BioTimeEmployee[]> {
  return fetchAllPages<BioTimeEmployee>(url, '/api/personnel/employees/', token);
}

export async function btDevices(url: string, token: string): Promise<BioTimeDevice[]> {
  return fetchAllPages<BioTimeDevice>(url, '/api/device/', token);
}

export async function btTransactions(
  url: string,
  token: string,
  startTime: string,
  endTime: string
): Promise<BioTimeTransaction[]> {
  return fetchAllPages<BioTimeTransaction>(url, '/api/transaction/', token, {
    start_time: startTime,
    end_time: endTime,
  });
}

export async function btAreas(url: string, token: string): Promise<{ id: number | string; area_name?: string; area_code?: string }[]> {
  return fetchAllPages(url, '/api/area/', token);
}
