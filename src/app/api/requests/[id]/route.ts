// /api/requests/[id] — إجراء على طلب: اعتماد/رفض بالمستوى الحالي + إتمام السلسلة
// عند اعتماد طلب سلفة بالكامل يُنشأ قرض مرتبط يُخصم من الرواتب تلقائيًا
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, handle, ok, HttpError } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { round3 } from '@/lib/calc';
import { parseSteps, requestTypeLabel } from '@/lib/requests';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'requests');
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string; comment?: string };
    const action = body.action || '';
    if (!['approve', 'reject', 'cancel'].includes(action)) throw new HttpError(400, 'إجراء غير معروف');

    const request = await db.employeeRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!request) throw new HttpError(404, 'الطلب غير موجود');
    if (request.status !== 'pending') throw new HttpError(400, `الطلب بـحالة ${request.status} — لا يمكن تغييره`);

    const steps = parseSteps(request.steps);

    if (action === 'cancel') {
      const updated = await db.employeeRequest.update({
        where: { id }, data: { status: 'cancelled', decidedAt: new Date() },
      });
      await logAudit({
        userId: user.id, action: 'update', entity: 'request', entityId: id,
        description: `إلغاء طلب ${requestTypeLabel(request.type)} — ${request.employee.name}`,
      });
      return ok(updated);
    }

    // المستوى الحالي: أول waiting
    const idx = steps.findIndex((s) => s.status === 'waiting');
    if (idx === -1) throw new HttpError(400, 'السلسلة مكتملة بالفعل');
    const step = steps[idx];

    // من يملك حق القرار هنا؟ صاحب المستوى، أو مدير النظام (تجاوز)، أو الموارد البشرية إذا لم يُضبط مستخدم المستوى
    const isStepOwner = step.userId === user.id;
    const isAdmin = user.role === 'admin';
    const isHrFallback = user.role === 'hr' && !step.userId;
    if (!isStepOwner && !isAdmin && !isHrFallback) {
      throw new HttpError(403, `هذا المستوى مسند إلى ${step.name} — لا تملك حق القرار هنا`);
    }

    if (action === 'reject') {
      steps[idx] = { ...step, status: 'rejected', comment: body.comment || undefined, at: new Date().toISOString() };
      const updated = await db.employeeRequest.update({
        where: { id },
        data: { steps: JSON.stringify(steps), status: 'rejected', decidedAt: new Date(), currentStep: idx },
      });
      await logAudit({
        userId: user.id, action: 'update', entity: 'request', entityId: id,
        description: `رفض طلب ${requestTypeLabel(request.type)} في المستوى ${idx + 1} — ${request.employee.name}`,
      });
      return ok(updated);
    }

    // اعتماد المستوى
    steps[idx] = { ...step, status: 'approved', comment: body.comment || undefined, at: new Date().toISOString() };
    const next = steps.findIndex((s) => s.status === 'waiting');

    if (next !== -1) {
      // بقيت مستويات — ينتظر الطلب التالي
      const updated = await db.employeeRequest.update({
        where: { id }, data: { steps: JSON.stringify(steps), currentStep: next },
      });
      await logAudit({
        userId: user.id, action: 'update', entity: 'request', entityId: id,
        description: `اعتماد مستوى ${idx + 1} لطلب ${requestTypeLabel(request.type)} — بقي ${steps.length - next} مستوى`,
      });
      return ok(updated);
    }

    // اكتملت السلسلة → الطلب معتمد نهائيًا
    let loanId: string | null = null;
    if (request.type === 'loan') {
      // إنشاء قرض مرتبط يُخصم من الرواتب تلقائيًا
      const payload = (() => { try { return JSON.parse(request.payload || '{}') as Record<string, unknown>; } catch { return {}; } })();
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

    const updated = await db.employeeRequest.update({
      where: { id },
      data: { steps: JSON.stringify(steps), status: 'approved', decidedAt: new Date(), currentStep: steps.length - 1, loanId },
    });
    await logAudit({
      userId: user.id, action: 'approve', entity: 'request', entityId: id,
      description: `اعتماد نهائي لطلب ${requestTypeLabel(request.type)} — ${request.employee.name}${loanId ? ' + إنشاء قرض مرتبط' : ''}`,
    });
    return ok(updated);
  });
}
