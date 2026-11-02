import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';

/** استعادة نقطة — مدير فقط، عملية حساسة تُسجل في التدقيق */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireWrite(req, 'restore');
    const { id } = await ctx.params;
    const rp = await db.restorePoint.findUnique({ where: { id } });
    if (!rp) return fail(404, 'نقطة الاستعادة غير موجودة');

    let snap: Record<string, unknown[]>;
    try {
      snap = JSON.parse(rp.snapshot);
    } catch {
      return fail(400, 'اللقطة تالفة');
    }

    type Row = Record<string, unknown>;
    const restoreOne = async (model: string, rows: Row[] | undefined, uniqueKey: string, mapFn: (r: Row) => Row) => {
      if (!rows) return;
      const d = db as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>;
      for (const r of rows) {
        const key = String(r[uniqueKey] || '');
        if (!key) continue;
        await d[model].upsert({
          where: { [uniqueKey]: key },
          update: mapFn(r),
          create: mapFn(r),
        }).catch(() => {});
      }
    };

    await restoreOne('department', snap.departments as Row[], 'id', (r) => ({ id: r.id, name: r.name, notes: r.notes ?? null, parentId: r.parentId ?? null }));
    await restoreOne('position', snap.positions as Row[], 'id', (r) => ({ id: r.id, name: r.name, notes: r.notes ?? null }));
    await restoreOne('employee', snap.employees as Row[], 'id', (r) => ({
      id: r.id, code: r.code, name: r.name, departmentId: r.departmentId ?? null,
      positionId: r.positionId ?? null, basicSalary: r.basicSalary ?? 0, status: r.status ?? 'active',
      pin: r.pin ?? null, civilId: r.civilId ?? null,
    }));
    await restoreOne('shift', snap.shifts as Row[], 'id', (r) => ({ id: r.id, name: r.name, type: r.type, startTime: r.startTime, endTime: r.endTime, crossDay: !!r.crossDay, graceMinutes: r.graceMinutes, earlyGraceMinutes: r.earlyGraceMinutes, otEnabled: !!r.otEnabled, otRoundMinutes: r.otRoundMinutes, halfDayMinutes: r.halfDayMinutes, workDays: r.workDays, active: !!r.active }));

    await logAudit({
      userId: admin.id, action: 'restore', entity: 'restore', entityId: id,
      description: `استعادة نقطة: ${rp.description}`,
    });
    return ok({ restored: true, description: rp.description, createdAt: rp.createdAt });
  });
}
