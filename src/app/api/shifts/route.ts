import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';

export const cfg: CrudConfig = {
  model: 'shift',
  entity: 'shifts',
  label: 'وردية',
  searchFields: ['name'],
  orderBy: { name: 'asc' },
  include: { _count: { select: { assignments: true } } },
  validate: (data) => {
    if (data.startTime && !/^\d{2}:\d{2}$/.test(String(data.startTime))) return 'صيغة بداية الوردية HH:MM';
    if (data.endTime && !/^\d{2}:\d{2}$/.test(String(data.endTime))) return 'صيغة نهاية الوردية HH:MM';
    if (data.workDays !== undefined) {
      try {
        const arr = JSON.parse(String(data.workDays));
        if (!Array.isArray(arr)) return 'أيام العمل مصفوفة أرقام 0=الأحد';
      } catch { return 'أيام العمل مصفوفة أرقام 0=الأحد'; }
    }
    return null;
  },
  beforeCreate: (data) => {
    for (const f of ['graceMinutes', 'earlyGraceMinutes', 'otRoundMinutes', 'halfDayMinutes']) {
      if (data[f] !== undefined) data[f] = Math.round(num(data[f]));
    }
    return data;
  },
  describe: (row) => `${row.name} (${row.startTime}-${row.endTime})`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'shifts');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    return crudCreate(req, user, cfg);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
