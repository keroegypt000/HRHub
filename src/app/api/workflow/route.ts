// /api/workflow — إعدادات سلاسل الموافقات: لكل وحدة × نوع طلب حتى 4 مستويات + إيميل إشعار
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, requireWrite, handle, ok, HttpError } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { REQUEST_TYPES } from '@/lib/requests';

/** قراءة كل الإعدادات + قائمة الوحدات (الأقسام) + المستخدمون للقوائم المنسدلة */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'workflow');
    const [configs, departments, users] = await Promise.all([
      db.workflowConfig.findMany({ orderBy: [{ unitKey: 'asc' }, { requestType: 'asc' }] }),
      db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
    ]);
    return ok({ configs, departments, users, types: REQUEST_TYPES });
  });
}

/** حفظ إعداد (إنشاء/تحديث) لكل (unitKey, requestType) */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'workflow');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const unitKey = String(body.unitKey || 'ALL').trim() || 'ALL';
    const requestType = String(body.requestType || '');
    if (!REQUEST_TYPES.some((t) => t.value === requestType)) throw new HttpError(400, 'نوع الطلب غير صحيح');

    const pick = (k: string): string | null => {
      const v = body[k];
      return v === undefined || v === null || v === '' ? null : String(v);
    };
    const data = {
      unitKey,
      requestType,
      departmentId: pick('departmentId'),
      level1UserId: pick('level1UserId'),
      level2UserId: pick('level2UserId'),
      level3UserId: pick('level3UserId'),
      level4UserId: pick('level4UserId'),
      notifyEmail: pick('notifyEmail'),
    };

    const existing = await db.workflowConfig.findUnique({ where: { unitKey_requestType: { unitKey, requestType } } });
    const config = existing
      ? await db.workflowConfig.update({ where: { id: existing.id }, data })
      : await db.workflowConfig.create({ data });

    await logAudit({
      userId: user.id, action: existing ? 'update' : 'create', entity: 'workflow', entityId: config.id,
      description: `إعداد موافقات ${requestType} للوحدة ${unitKey}`,
    });
    return ok(config);
  });
}
