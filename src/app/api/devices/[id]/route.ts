import { NextRequest } from 'next/server';
import { requireWrite, handle, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { crudUpdate, crudDelete } from '@/lib/crud';
import { cfg } from '../route';

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
    // البصمات سجل قانوني للحضور والرواتب — حذف الجهاز كان يمسحها معه
    const logs = await db.attendanceLog.count({ where: { device: { id } } });
    if (logs > 0) return fail(409, `الجهاز عليه ${logs} بصمة محفوظة — لا يمكن حذفه حتى لا تضيع البصمات. عطّله أو عدّل بياناته بدلًا من الحذف`);
    return crudDelete(req, user, cfg, id);
  });
}
