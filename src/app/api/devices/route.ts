import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

export const cfg: CrudConfig = {
  model: 'device',
  entity: 'devices',
  label: 'جهاز بصمة',
  searchFields: ['sn', 'name', 'location'],
  orderBy: { createdAt: 'desc' },
  include: { _count: { select: { attendanceLogs: true } } },
  beforeCreate: (data) => {
    if (data.port !== undefined && data.port !== null && data.port !== '') data.port = Math.round(num(data.port));
    return data;
  },
  describe: (row) => `${row.name} (${row.sn})`,
};

/** قائمة الأجهزة مع الحالة الحية: online إذا ظهر خلال 90 ثانية */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'devices');
    const res = await crudList(req, user, cfg);
    const data = (await res.json()) as { rows: Array<{ id: string; lastSeenAt: string | null; status: string }> };
    const now = Date.now();
    for (const row of data.rows || []) {
      row.status = row.lastSeenAt && now - new Date(row.lastSeenAt).getTime() < 90_000 ? 'online' : 'offline';
    }
    return new Response(JSON.stringify(data), {
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
