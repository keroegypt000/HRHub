// lib/request-flow.ts — دورة حياة طلبات الموظفين: الإنشاء وبناء السلسلة + الاعتماد/الرفض/الإلغاء + الإشعارات
// مشتركة بين شاشة الطلبات (الإدارة) وبوابة الموظف (ESS)
import { db } from '@/lib/db';
import { HttpError } from '@/lib/api';
import { AuthUser, canWrite } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { round3 } from '@/lib/calc';
import { REQUEST_TYPES, requestTypeLabel, parseSteps, RequestStep } from '@/lib/requests';
import { createLeaveRequest } from '@/lib/leaves';
import { recomputeRange } from '@/lib/attendance';
import { notifyApprover, notifyDecision } from '@/lib/mail';

/** بناء سلسلة الموافقة لموظف: إعداد وحدته إن وجد ثم إعداد ALL، وبدون إعداد: الموارد البشرية ثم المدير */
export async function buildSteps(employeeId: string, type: string): Promise<RequestStep[]> {
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

const PAYLOAD_KEYS = ['leaveTypeId', 'fromDate', 'toDate', 'days', 'amount', 'installments', 'monthlyDeduction', 'description', 'purpose'];

/** إنشاء طلب جديد + إشعار صاحب المستوى الأول */
export async function createEmployeeRequest(user: AuthUser, employeeId: string, type: string, body: Record<string, unknown>) {
  if (!employeeId) throw new HttpError(400, 'اختر الموظف');
  if (!REQUEST_TYPES.some((t) => t.value === type)) throw new HttpError(400, 'نوع الطلب غير صحيح');

  const payload: Record<string, unknown> = {};
  for (const k of PAYLOAD_KEYS) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') payload[k] = body[k];
  }
  if (type === 'vacation' && (!payload.leaveTypeId || !payload.fromDate || !payload.toDate)) {
    throw new HttpError(400, 'طلب الإجازة يحتاج نوع الإجازة وتاريخ البداية والنهاية');
  }
  if (type === 'vacation' && String(payload.fromDate) > String(payload.toDate)) {
    throw new HttpError(400, 'تاريخ البداية يجب أن يسبق النهاية');
  }
  if (type === 'loan' && !(Number(payload.amount) > 0)) throw new HttpError(400, 'أدخل مبلغ السلفة');

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
    include: { employee: { select: { id: true, name: true, code: true, email: true, department: { select: { name: true } } } } },
  });

  await logAudit({
    userId: user.id, action: 'create', entity: 'request', entityId: request.id,
    description: `طلب ${requestTypeLabel(type)} — ${emp?.name || employeeId} (${steps.length} مستوى موافقة)`,
  });
  await notifyApprover(request, steps[0], 1);
  return request;
}

/** إجراء على طلب: اعتماد/رفض المستوى الحالي أو إلغاء */
export async function actOnRequest(user: AuthUser, id: string, action: string, comment?: string) {
  if (!['approve', 'reject', 'cancel'].includes(action)) throw new HttpError(400, 'إجراء غير معروف');

  const request = await db.employeeRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!request) throw new HttpError(404, 'الطلب غير موجود');
  if (request.status !== 'pending') throw new HttpError(400, `الطلب بـحالة ${request.status} — لا يمكن تغييره`);

  const steps = parseSteps(request.steps);
  const isAdmin = user.role === 'admin';
  const isOwnRequest = !!user.employeeId && user.employeeId === request.employeeId;

  /** تحديث مشروط: يفشل إن غيّر شخص آخر الطلب منذ قراءته (منع الاعتماد المزدوج) */
  const guardedUpdate = async (data: Record<string, unknown>) => {
    const res = await db.employeeRequest.updateMany({ where: { id, status: 'pending', steps: request.steps }, data });
    if (res.count === 0) throw new HttpError(409, 'تم اتخاذ إجراء على هذا الطلب للتو من مستخدم آخر — حدّث الصفحة');
  };

  if (action === 'cancel') {
    // الإلغاء: الموظف صاحب الطلب، أو من يملك صلاحية الطلبات
    if (!isOwnRequest && !canWrite(user, 'requests')) throw new HttpError(403, 'لا تملك إلغاء هذا الطلب');
    await guardedUpdate({ status: 'cancelled', decidedAt: new Date() });
    await logAudit({
      userId: user.id, action: 'update', entity: 'request', entityId: id,
      description: `إلغاء طلب ${requestTypeLabel(request.type)} — ${request.employee.name}`,
    });
    return db.employeeRequest.findUnique({ where: { id } });
  }

  // المستوى الحالي: أول waiting
  const idx = steps.findIndex((s) => s.status === 'waiting');
  if (idx === -1) throw new HttpError(400, 'السلسلة مكتملة بالفعل');
  const step = steps[idx];

  // من يملك حق القرار هنا؟ صاحب المستوى، أو مدير النظام (تجاوز)، أو الموارد البشرية إذا لم يُضبط مستخدم المستوى
  const isStepOwner = step.userId === user.id;
  const isHrFallback = user.role === 'hr' && !step.userId;
  if (!isStepOwner && !isAdmin && !isHrFallback) {
    throw new HttpError(403, `هذا المستوى مسند إلى ${step.name} — لا تملك حق القرار هنا`);
  }
  if (isOwnRequest && !isAdmin) throw new HttpError(403, 'لا يمكنك اعتماد طلبك بنفسك');

  const mailRequest = () => ({ ...request, employee: { name: request.employee.name, code: request.employee.code, email: request.employee.email } });

  if (action === 'reject') {
    steps[idx] = { ...step, status: 'rejected', comment: comment || undefined, at: new Date().toISOString() };
    await guardedUpdate({ steps: JSON.stringify(steps), status: 'rejected', decidedAt: new Date(), currentStep: idx });
    await logAudit({
      userId: user.id, action: 'update', entity: 'request', entityId: id,
      description: `رفض طلب ${requestTypeLabel(request.type)} في المستوى ${idx + 1} — ${request.employee.name}`,
    });
    await notifyDecision({ ...mailRequest(), status: 'rejected' }, comment);
    return db.employeeRequest.findUnique({ where: { id } });
  }

  // اعتماد المستوى
  steps[idx] = { ...step, status: 'approved', comment: comment || undefined, at: new Date().toISOString() };
  const next = steps.findIndex((s) => s.status === 'waiting');

  if (next !== -1) {
    // بقيت مستويات — ينتظر الطلب التالي
    await guardedUpdate({ steps: JSON.stringify(steps), currentStep: next });
    await logAudit({
      userId: user.id, action: 'update', entity: 'request', entityId: id,
      description: `اعتماد مستوى ${idx + 1} لطلب ${requestTypeLabel(request.type)} — بقي ${steps.length - next} مستوى`,
    });
    await notifyApprover(mailRequest(), steps[next], next + 1);
    return db.employeeRequest.findUnique({ where: { id } });
  }

  // اكتملت السلسلة → حجز الطلب أولًا (يمنع إنشاء إجازة/قرض مرتين لو اعتمد اثنان معًا)
  const payload = (() => { try { return JSON.parse(request.payload || '{}') as Record<string, unknown>; } catch { return {}; } })();
  await guardedUpdate({ steps: JSON.stringify(steps), status: 'approved', decidedAt: new Date(), currentStep: steps.length - 1 });

  let leaveId: string | null = null;
  let loanId: string | null = null;
  try {
    if (request.type === 'vacation') {
      // إجازة معتمدة فعلية — تحمي أيامها من الغياب في الرواتب وتُخصم من الرصيد
      if (!payload.leaveTypeId || !payload.fromDate || !payload.toDate) {
        throw new HttpError(400, 'طلب الإجازة ينقصه نوع الإجازة أو التواريخ — لا يمكن اعتماده');
      }
      const from = new Date(`${String(payload.fromDate).slice(0, 10)}T00:00:00.000+03:00`);
      const to = new Date(`${String(payload.toDate).slice(0, 10)}T00:00:00.000+03:00`);
      const { created } = await createLeaveRequest({
        employeeId: request.employeeId, leaveTypeId: String(payload.leaveTypeId), from, to,
        reason: payload.description ? String(payload.description) : `طلب موظف #${id.slice(-6)}`,
        status: 'approved', reviewedBy: user.id,
      });
      leaveId = created.id;
      await recomputeRange({
        from: String(payload.fromDate).slice(0, 10), to: String(payload.toDate).slice(0, 10), employeeId: request.employeeId,
      }).catch(() => {});
    }
    if (request.type === 'loan') {
      // إنشاء قرض مرتبط يُخصم من الرواتب تلقائيًا
      const amount = Number(payload.amount) || 0;
      const installments = Math.max(1, Number(payload.installments) || 1);
      if (amount > 0) {
        const monthly = payload.monthlyDeduction !== undefined && payload.monthlyDeduction !== ''
          ? Number(payload.monthlyDeduction) : round3(amount / installments);
        const loan = await db.loan.create({
          data: {
            employeeId: request.employeeId,
            name: `سلفة معتمدة من طلب #${id.slice(-6)}`,
            totalAmount: amount,
            installmentsCount: installments,
            monthlyDeduction: monthly > 0 ? monthly : round3(amount / installments),
            startDate: payload.fromDate ? new Date(String(payload.fromDate)) : new Date(),
            notes: 'أُنشئ تلقائيًا بعد اعتماد الطلب',
          },
        });
        loanId = loan.id;
      }
    }
  } catch (err) {
    // تعذّر التنفيذ (مثل إجازة متداخلة) — نُرجع الطلب لانتظار نفس المستوى
    await db.employeeRequest.update({ where: { id }, data: { steps: request.steps, status: 'pending', decidedAt: null, currentStep: request.currentStep } });
    throw err;
  }

  const updated = await db.employeeRequest.update({
    where: { id },
    data: { loanId, payload: leaveId ? JSON.stringify({ ...payload, leaveId }) : request.payload },
  });
  await logAudit({
    userId: user.id, action: 'approve', entity: 'request', entityId: id,
    description: `اعتماد نهائي لطلب ${requestTypeLabel(request.type)} — ${request.employee.name}${loanId ? ' + إنشاء قرض مرتبط' : ''}${leaveId ? ' + تسجيل الإجازة' : ''}`,
  });
  await notifyDecision({ ...mailRequest(), status: 'approved' }, comment);
  return updated;
}
