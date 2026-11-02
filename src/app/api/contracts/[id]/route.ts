import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { checkContractOverlap } from '@/lib/contracts';
import { cfg } from '../route';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'contracts');
    const { id } = await ctx.params;
    const existing = await db.contract.findUnique({ where: { id } });
    if (!existing) return fail(404, 'العقد غير موجود');
    const cfgWithId: CrudConfig = {
      ...cfg,
      validate: async (data, mode) => {
        if (data.startDate && (data.employeeId || existing.employeeId)) {
          const overlap = await checkContractOverlap({
            employeeId: String(data.employeeId || existing.employeeId),
            contractId: id,
            startDate: new Date(String(data.startDate)),
            endDate: data.endDate ? new Date(String(data.endDate)) : null,
          });
          if (overlap) return `تعارض في العقود: ${overlap}`;
        }
        return null;
      },
    };
    return crudUpdate(req, user, cfgWithId, id);
  });
}

/** إنهاء عقد بسبب موثق (بدل الحذف) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'contracts');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { terminate?: boolean; reason?: string };
    if (!body.terminate) return fail(400, 'طلب غير معروف');
    const existing = await db.contract.findUnique({ where: { id } });
    if (!existing) return fail(404, 'العقد غير موجود');
    const updated = await db.contract.update({
      where: { id },
      data: { status: 'terminated', terminatedAt: new Date(), terminationReason: body.reason || 'غير محدد' },
    });
    const { logAudit } = await import('@/lib/audit');
    const { createRestorePoint } = await import('@/lib/restores');
    await logAudit({ userId: user.id, action: 'update', entity: 'contract', entityId: id, description: `إنهاء عقد ${existing.contractNo} — السبب: ${body.reason || 'غير محدد'}` });
    await createRestorePoint(user.id, `إنهاء عقد: ${existing.contractNo}`);
    return ok(updated);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'contracts');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
