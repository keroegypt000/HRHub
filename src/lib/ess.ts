// lib/ess.ts — بوابة الموظف (Employee Self Service): كل مسار يرى بيانات صاحب الحساب فقط
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, requireUser } from '@/lib/api';
import { AuthUser } from '@/lib/auth';

/** المستخدم الحالي + ملف الموظف المرتبط به — 403 إن لم يكن الحساب مربوطًا بموظف */
export async function requireEmployee(req: NextRequest): Promise<{ user: AuthUser; employeeId: string }> {
  const user = await requireUser(req);
  if (!user.employeeId) throw new HttpError(403, 'هذا الحساب غير مربوط بملف موظف — راجع الموارد البشرية');
  const emp = await db.employee.findUnique({ where: { id: user.employeeId }, select: { id: true } });
  if (!emp) throw new HttpError(404, 'ملف الموظف غير موجود');
  return { user, employeeId: emp.id };
}

/** الفترات المنشورة للموظف: المعتمدة والمصروفة فقط (لا يرى المسودات) */
export const RELEASED_PERIOD_STATUSES = ['approved', 'paid'];
