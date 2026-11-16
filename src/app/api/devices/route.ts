import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { encryptSecret } from '@/lib/settings';

/** كلمة سر ACTAtek: تُشفَّر عند الحفظ، والفارغ عند التعديل = إبقاء القديمة */
const SECRET_MASK = '••••••';
function prepSecret(data: Record<string, unknown>, existing?: Record<string, unknown>) {
  const v = data.apiPassword;
  if (v === undefined || v === null || v === '' || v === SECRET_MASK) {
    if (existing) delete data.apiPassword; else data.apiPassword = null;
  } else data.apiPassword = encryptSecret(String(v));
  if (data.vendor === 'actatek') data.mode = 'local'; // ACTAtek يُسحب من الشبكة دائمًا
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
    const data = (await res.json()) as { rows: Array<{ id: string; lastSeenAt: string | null; status: string; apiPassword?: string | null }> };
    const now = Date.now();
    for (const row of data.rows || []) {
      row.apiPassword = row.apiPassword ? SECRET_MASK : ''; // لا تُرسل كلمة السر المشفرة للمتصفح
      row.status = row.lastSeenAt && now - new Date(row.lastSeenAt).getTime() < 90_000 ? 'online' : 'offline';
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
    return crudCreate(req, user, cfg);
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
