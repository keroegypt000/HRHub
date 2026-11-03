// /api/requests — طلبات الموظفين العامة بسلسلة موافقات (9 أنواع × 4 مستويات)
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRead, requireWrite, handle, ok, HttpError } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3 } from '@/lib/calc';
import { REQUEST_TYPES, requestTypeLabel, parseSteps, RequestStep } from '@/lib/requests';

/** بناء سلسلة الموافقة لموظف: إعداد وحدته إن وجد ثم إعداد ALL، وبدون إعداد: الموارد البشرية ثم المدير */
async function buildSteps(employeeId: string, type: string): Promise<RequestStep[]> {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { department: { select: { name: true } } } });
  if (!emp) throw new HttpError(404, 'الموظف غير موجود');
  const unitKey = emp.department?.name || 'ALL';

  const configs = await db.workflowConfig.findMany({ where: { requestType: type } });
  const exact = configs.find((c) => c.unitKey === unitKey) || configs.find((c) => c.unitKey === 'ALL');

  const ids = exact
    ? [exact.level1UserId, exact.level2UserId, exact.level3UserId, exact.level4UserId].filter((x): x is string => !!x)
    : [];
  let chain = ids;
  if (!chain.length) {
    // افتراضي: أول مستويات = مستخدمو الموارد البشرية ثم المدير
    const hrs = await db.user.findMany({ where: { active: true, role: { in: ['admin', 'hr'] } }, orderBy: { role: 'asc' }, take: 2 });
    chain = hrs.map((u) => u.id);
  }
  if (!chain.length) throw new HttpError(400, 'لا توجد سلسلة موافقات معرفة — اضبطها من إعدادات الموافقات أولًا');

  const users = await db.user.findMany({ where: { id: { in: chain } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return chain.map((uid) => ({ userId: uid, name: nameOf.get(uid) || uid, status: 'waiting' as const }));
}

/** قائمة الطلبات مع فلاتر */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'requests');
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const employeeId = url.searchParams.get('employeeId');
    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (type && type !== 'all') where.type = type;
    if (employeeId && employeeId !== 'all') where.employeeId = employeeId;

    const rows = await db.employeeRequest.findMany({
      where,
      include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return ok({ rows });
  });
}

/** إنشاء طلب جديد — يبني سلسلة الموافقات تلقائيًا من إعدادات الوحدة */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'requests');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const employeeId = String(body.employeeId || '');
    const type = String(body.type || '');
    if (!employeeId) throw new HttpError(400, 'اختر الموظف');
    if (!REQUEST_TYPES.some((t) => t.value === type)) throw new HttpError(400, 'نوع الطلب غير صحيح');

    // تفاصيل النوع (payload)
    const payload: Record<string, unknown> = {};
    for (const k of ['leaveTypeId', 'fromDate', 'toDate', 'days', 'amount', 'installments', 'monthlyDeduction', 'description', 'purpose']) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '') payload[k] = body[k];
    }

    if (type === 'vacation' && (!payload.leaveTypeId || !payload.fromDate || !payload.toDate)) {
      throw new HttpError(400, 'طلب الإجازة يحتاج نوع الإجازة وتاريخ البداية والنهاية');
    }

    const steps = await buildSteps(employeeId, type);
    const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { department: { select: { name: true } } } });

    const request = await db.employeeRequest.create({
      data: {
        employeeId,
        type,
        unitKey: emp?.department?.name || null,
        payload: JSON.stringify(payload),
        steps: JSON.stringify(steps),
        notes: body.notes ? String(body.notes) : null,
      },
      include: { employee: { select: { id: true, name: true, code: true, department: { select: { name: true } } } } },
    });

    await logAudit({
      userId: user.id, action: 'create', entity: 'request', entityId: request.id,
      description: `طلب ${requestTypeLabel(type)} — ${emp?.name || employeeId} (${steps.length} مستوى موافقة)`,
    });
    return ok(request, 201);
  });
}
