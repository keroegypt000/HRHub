import { licenseLimit } from '@/lib/license';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, HttpError, fail } from '@/lib/api';
import { pullDevice } from '@/lib/device-pull';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { encryptSecret } from '@/lib/settings';

/** كلمة سر ACTAtek: تُشفَّر عند الحفظ، والفارغ عند التعديل = إبقاء القديمة */
const SECRET_MASK = '••••••';
/** نوع الربط (حقل واحد واضح في النموذج) → الشركة + طريقة الاتصال */
export const DEVICE_KINDS: Record<string, { vendor: string; mode: string; port: number }> = {
  'zk-local': { vendor: 'zkteco', mode: 'local', port: 4370 },
  'zk-push': { vendor: 'zkteco', mode: 'push', port: 4370 },
  actatek: { vendor: 'actatek', mode: 'local', port: 80 },
};
export function deviceKind(d: { vendor?: unknown; mode?: unknown }): string {
  return d.vendor === 'actatek' ? 'actatek' : d.mode === 'push' ? 'zk-push' : 'zk-local';
}

function applyKind(data: Record<string, unknown>, existing?: Record<string, unknown>) {
  const kind = String(data.kind || (existing ? deviceKind(existing) : 'zk-local'));
  delete data.kind;
  const k = DEVICE_KINDS[kind] || DEVICE_KINDS['zk-local'];
  data.vendor = k.vendor; data.mode = k.mode;
  // المنفذ الافتراضي حسب النوع — ومنفذ ZKTeco (4370) لا يصلح لجهاز ACTAtek
  if (data.port === undefined || data.port === null || data.port === '' || (kind === 'actatek' && Number(data.port) === 4370)) data.port = data.useHttps ? (kind === 'actatek' ? 443 : k.port) : k.port;
  if (k.mode === 'local' && !String(data.ipAddress ?? existing?.ipAddress ?? '').trim()) {
    throw new HttpError(400, 'أدخل عنوان IP الجهاز (من قائمة الجهاز: Comm ← Ethernet)');
  }
  if (kind === 'actatek' && !existing && (!data.apiUser || !data.apiPassword)) {
    throw new HttpError(400, 'أدخل اسم مستخدم وكلمة سر جهاز ACTAtek');
  }
  if (kind === 'zk-push' && !existing && !String(data.sn || '').trim()) {
    throw new HttpError(400, 'أجهزة الإرسال (ADMS) تحتاج الرقم التسلسلي SN من قائمة الجهاز: System Info');
  }
  if (typeof data.ipAddress === 'string') data.ipAddress = data.ipAddress.trim();
  return data;
}

function prepSecret(data: Record<string, unknown>, existing?: Record<string, unknown>) {
  applyKind(data, existing);
  const v = data.apiPassword;
  if (v === undefined || v === null || v === '' || v === SECRET_MASK) {
    if (existing) delete data.apiPassword; else data.apiPassword = null;
  } else data.apiPassword = encryptSecret(String(v));
  // SN اختياري للأجهزة المحلية: رقم مؤقت من الـ IP، ويُستبدل بالحقيقي من الجهاز عند أول سحب
  if (!existing && (!data.sn || !String(data.sn).trim())) {
    data.sn = data.ipAddress ? `LOCAL-${String(data.ipAddress).trim()}` : `DEV-${Date.now().toString(36).toUpperCase()}`;
  }
  return data;
}

export const cfg: CrudConfig = {
  model: 'device',
  entity: 'devices',
  label: 'جهاز بصمة',
  searchFields: ['sn', 'name', 'location'],
  orderBy: { createdAt: 'desc' },
  include: { _count: { select: { attendanceLogs: true } } },
  beforeCreate: (data) => {
    if (data.port !== undefined && data.port !== null && data.port !== '') data.port = Math.round(num(data.port));
    return prepSecret(data);
  },
  beforeUpdate: (data, existing) => {
    if (data.port !== undefined && data.port !== null && data.port !== '') data.port = Math.round(num(data.port));
    return prepSecret(data, existing);
  },
  describe: (row) => `${row.name} (${row.sn})`,
};

/** قائمة الأجهزة مع الحالة الحية: online إذا ظهر خلال 90 ثانية */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'devices');
    const res = await crudList(req, user, cfg);
    const data = (await res.json()) as { rows: Array<{ id: string; lastSeenAt: string | null; lastPullAt?: string | null; status: string; mode?: string; vendor?: string; kind?: string; apiPassword?: string | null }> };
    // جهاز البصمات اليدوية (الموارد البشرية) داخلي — لا يظهر في قائمة الأجهزة
    data.rows = (data.rows || []).filter((r) => (r as { sn?: string }).sn !== 'MANUAL-HR');
    const now = Date.now();
    for (const row of data.rows || []) {
      row.kind = deviceKind(row);
      row.apiPassword = row.apiPassword ? SECRET_MASK : ''; // لا تُرسل كلمة السر المشفرة للمتصفح
      if (row.mode === 'local') {
        // جهاز السحب: متصل لو آخر سحب ناجح خلال 20 دقيقة (السحب التلقائي كل 5 دقائق)
        const last = Math.max(row.lastPullAt ? new Date(row.lastPullAt).getTime() : 0, row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0);
        row.status = row.status === 'offline' ? 'offline' : last && now - last < 20 * 60_000 ? 'online' : last ? 'offline' : 'unknown';
      } else {
        // جهاز الإرسال (ADMS): متصل لو أرسل نبضة خلال 10 دقائق
        row.status = row.lastSeenAt && now - new Date(row.lastSeenAt).getTime() < 10 * 60_000 ? 'online' : 'offline';
      }
    }
    return new NextResponse(JSON.stringify(data), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const maxDevices = await licenseLimit('devices');
    if (maxDevices !== null && await db.device.count({ where: { sn: { not: 'MANUAL-HR' } } }) >= maxDevices) {
      return fail(402, `الترخيص يسمح بـ ${maxDevices} جهاز بصمة فقط — جدّد الترخيص لإضافة المزيد`);
    }
    const res = await crudCreate(req, user, cfg);
    if (res.status >= 300) return res;
    const row = (await res.json()) as { id: string; mode?: string };
    // جهاز السحب: أول سحب يبدأ فورًا في الخلفية (لا ينتظر 5 دقائق)
    if (row.mode === 'local') void pullDevice(row.id, user.id).catch(() => {});
    return NextResponse.json(row, { status: res.status });
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'devices');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
