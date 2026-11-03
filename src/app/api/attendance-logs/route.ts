import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { recomputeDayForEmployees, recomputeRange } from '@/lib/attendance';
import { resolveEmployeeByPin } from '@/lib/attendance';
import { dateKey, dayRange, kuwaitMidnight } from '@/lib/time';
import { STATUS_AR, VERIFY_AR } from '@/lib/zk/protocol';

/** سجل البصمة الخام — فلاتر: فترة، موظف، جهاز، مصدر + شاشة غير المعروفين */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'attendance-logs');
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const employeeId = url.searchParams.get('employeeId');
    const deviceId = url.searchParams.get('deviceId');
    const source = url.searchParams.get('source');
    const unknown = url.searchParams.get('unknown') === '1';
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1000);

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.punchTime = {
        ...(from ? { gte: kuwaitMidnight(from) } : {}),
        ...(to ? { lt: new Date(kuwaitMidnight(to).getTime() + 24 * 3600_000) } : {}),
      };
    }
    if (employeeId && employeeId !== 'all') where.employeeId = employeeId;
    if (deviceId && deviceId !== 'all') {
      // يقبل معرف الجهاز (cuid) أو الرقم التسلسلي SN مباشرة
      const dev = await db.device.findUnique({ where: { id: deviceId } }).catch(() => null);
      where.sn = dev ? dev.sn : deviceId;
    }
    if (source && source !== 'all') where.source = source;
    if (unknown) where.employeeId = null;

    const [rows, total] = await Promise.all([
      db.attendanceLog.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, code: true } },
          device: { select: { sn: true, name: true } },
        },
        orderBy: { punchTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.attendanceLog.count({ where }),
    ]);

    const decorated = rows.map((r) => ({
      ...r,
      statusAr: STATUS_AR[r.status] || String(r.status),
      verifyAr: VERIFY_AR[r.verify] || String(r.verify),
    }));
    return ok({ rows: decorated, total, page, limit });
  });
}

/** تسجيل سجل يدوي (بموافقة HR) أو ربط pin غير معروف بموظف */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'attendance-logs');
    const body = (await req.json().catch(() => ({}))) as {
      mode?: 'manual' | 'link' | 'bulk-link';
      pin?: string; employeeId?: string; sn?: string; punchTime?: string; status?: number; verify?: number; note?: string;
      mappings?: { pin: string; employeeId: string }[];
    };

    // ربط جماعي من شاشة السجلات غير المعروفة
    if (body.mode === 'bulk-link' && body.mappings?.length) {
      let linked = 0;
      for (const m of body.mappings) {
        const updated = await db.attendanceLog.updateMany({
          where: { pin: m.pin, employeeId: null },
          data: { employeeId: m.employeeId },
        });
        linked += updated.count;
      }
      await recomputeRange({ from: dateKey(new Date(Date.now() - 60 * 86400_000)), to: dateKey(), employeeIds: body.mappings.map((m) => m.employeeId) }).catch(() => {});
      await logAudit({ userId: user.id, action: 'update', entity: 'attendance-log', description: `ربط جماعي: ${linked} سجلة بموظفين` });
      return ok({ linked });
    }

    // ربط pin واحد
    if (body.mode === 'link' && body.pin && body.employeeId) {
      const updated = await db.attendanceLog.updateMany({
        where: { pin: body.pin, employeeId: null },
        data: { employeeId: body.employeeId },
      });
      await recomputeRange({ from: dateKey(new Date(Date.now() - 60 * 86400_000)), to: dateKey(), employeeId: body.employeeId }).catch(() => {});
      await logAudit({ userId: user.id, action: 'update', entity: 'attendance-log', description: `ربط pin ${body.pin} بموظف (${updated.count} سجلة)` });
      return ok({ linked: updated.count });
    }

    // سجل يدوي
    if (!body.pin || !body.sn || !body.punchTime) {
      return fail(400, 'أكمل: الرقم الوظيفي PIN، الجهاز، وقت السجلة');
    }
    const device = await db.device.findUnique({ where: { sn: body.sn } });
    if (!device) return fail(404, 'الجهاز غير موجود — أضفه أولًا');
    const emp = await resolveEmployeeByPin(body.pin);
    const punchTime = new Date(body.punchTime.includes('T') ? body.punchTime : body.punchTime.replace(' ', 'T') + '+03:00');
    if (!Number.isFinite(punchTime.getTime())) return fail(400, 'وقت السجلة غير صالح');

    const created = await db.attendanceLog.create({
      data: {
        sn: body.sn,
        pin: body.pin,
        employeeId: emp?.id || null,
        punchTime,
        status: body.status ?? 0,
        verify: body.verify ?? 1,
        source: 'manual',
      },
      include: { employee: true, device: true },
    }).catch(() => null);
    if (!created) return fail(400, 'سجلة مكررة — نفس الـ pin والوقت والحالة موجودة');

    if (created.employeeId) await recomputeDayForEmployees([created.employeeId], dateKey(punchTime));
    await logAudit({
      userId: user.id, action: 'create', entity: 'attendance-log', entityId: created.id,
      description: `سجل بصمة يدوي: ${created.employee?.name || body.pin} في ${body.punchTime}`,
    });
    return ok(created, 201);
  });
}

/** حذف سجل خام — حق المدير فقط مع تدقيق (قاعدة 2) */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'attendance-logs');
    if (user.role !== 'admin') {
      return fail(403, 'حذف سجل خام حق للمدير فقط');
    }
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return fail(400, 'أرسل معرف السجل');
    const log = await db.attendanceLog.findUnique({ where: { id: body.id }, include: { employee: true } });
    if (!log) return fail(404, 'السجل غير موجود');
    await db.attendanceLog.delete({ where: { id: body.id } });
    if (log.employeeId) await recomputeDayForEmployees([log.employeeId], dateKey(log.punchTime));
    await logAudit({
      userId: user.id, action: 'delete', entity: 'attendance-log', entityId: body.id,
      description: `حذف سجل خام (حق المدير): ${log.employee?.name || log.pin} — ${log.punchTime.toISOString()}`,
    });
    return ok({ deleted: true });
  });
}
