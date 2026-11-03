// /api/ess/leave-types — أنواع الإجازات المتاحة لطلب الموظف
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requireEmployee } from '@/lib/ess';

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireEmployee(req);
    const rows = await db.leaveType.findMany({ where: { active: true }, select: { id: true, name: true, paid: true }, orderBy: { name: 'asc' } });
    return ok({ rows });
  });
}
