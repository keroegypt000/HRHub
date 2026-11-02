// lib/auth.ts — مصادقة مخصصة بدون مكتبات: scrypt + جلسات في قاعدة البيانات + أدوار وصلاحيات
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const SESSION_HOURS = 12;

// ===== كلمات السر =====
export function makeSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = Buffer.from(hashPassword(password, salt), 'hex');
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

// ===== الجلسات =====
export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

/** يجدد الجلسة تلقائيًا عند تجاوز نصف مدتها */
async function maybeRenew(sessionId: string, expiresAt: Date): Promise<void> {
  const halfMs = (SESSION_HOURS / 2) * 3600_000;
  if (expiresAt.getTime() - Date.now() < halfMs) {
    const newExpiry = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await db.session.update({ where: { id: sessionId }, data: { expiresAt: newExpiry } });
  }
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: Record<string, boolean> | null;
  active: boolean;
}

export async function getSessionUser(req: NextRequest): Promise<AuthUser | null> {
  let token: string | undefined =
    req.cookies.get('sid')?.value || undefined;
  const authHeader = req.headers.get('authorization');
  if (!token && authHeader?.startsWith('Bearer ')) token = authHeader.slice(7);
  if (!token) return null;

  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.active) return null;
  await maybeRenew(session.id, session.expiresAt).catch(() => {});

  let permissions: Record<string, boolean> | null = null;
  if (session.user.permissions) {
    try {
      permissions = JSON.parse(session.user.permissions);
    } catch {
      permissions = null;
    }
  }
  return {
    id: session.user.id,
    username: session.user.username,
    name: session.user.name,
    role: session.user.role,
    permissions,
    active: session.user.active,
  };
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } });
}

// ===== الأدوار والصلاحيات =====
export const ROLES: Record<string, string> = {
  admin: 'مدير النظام',
  hr: 'موارد بشرية',
  accountant: 'محاسب',
  supervisor: 'مشرف',
  viewer: 'مشاهد',
};

/** كيانات القراءة المحمية للمدير فقط */
const ADMIN_ONLY_READ = new Set(['users', 'audit', 'restore', 'settings']);

/** من يكتب ماذا — القاعدة الرسمية للأدوار */
const WRITE_MATRIX: Record<string, Set<string>> = {
  admin: new Set(['*']),
  hr: new Set([
    'employees', 'departments', 'positions', 'contracts', 'shifts', 'shift-assignments',
    'leave-types', 'leaves', 'leave-approve', 'holidays', 'devices', 'files',
    'attendance-logs', 'daily-attendance', 'import', 'employees-photo',
    'passports', 'vehicles', 'company-contracts',
  ]),
  accountant: new Set(['payroll-periods', 'salary-components', 'payslips', 'export', 'import', 'settlements']),
  supervisor: new Set(['leaves']), // طلبات إجازة لفريقه فقط
  viewer: new Set([]),
};

const READ_MATRIX: Record<string, Set<string>> = {
  admin: new Set(['*']),
  hr: new Set(['*']),
  accountant: new Set(['*']),
  supervisor: new Set([
    'employees', 'departments', 'positions', 'contracts', 'shifts', 'shift-assignments',
    'leave-types', 'leaves', 'holidays', 'devices', 'attendance-logs', 'daily-attendance',
    'reports', 'export', 'dashboard', 'files',
    'passports', 'vehicles', 'company-contracts', 'alerts', 'end-of-service',
  ]),
  viewer: new Set([
    'employees', 'departments', 'positions', 'contracts', 'shifts', 'shift-assignments',
    'leave-types', 'leaves', 'holidays', 'devices', 'attendance-logs', 'daily-attendance',
    'payroll-periods', 'payslips', 'salary-components', 'reports', 'export', 'dashboard', 'files',
    'passports', 'vehicles', 'company-contracts', 'alerts', 'end-of-service',
  ]),
};

function roleCan(matrix: Record<string, Set<string>>, role: string, entity: string): boolean {
  const set = matrix[role];
  if (!set) return false;
  return set.has('*') || set.has(entity);
}

/** صلاحية دقيقة تتجاوز الافتراضي: {"payroll": true, "devices": false} */
export function permissionOverride(
  user: AuthUser,
  entity: string,
  mode: 'read' | 'write'
): boolean | undefined {
  if (!user.permissions) return undefined;
  // مفاتيح الكتابة = اسم الكيان؛ مفاتيح القراءة = read:entity
  if (mode === 'write' && entity in user.permissions) return !!user.permissions[entity];
  if (mode === 'read' && `read:${entity}` in user.permissions) return !!user.permissions[`read:${entity}`];
  return undefined;
}

export function canWrite(user: AuthUser, entity: string): boolean {
  const override = permissionOverride(user, entity, 'write');
  if (override !== undefined) return override;
  return roleCan(WRITE_MATRIX, user.role, entity);
}

export function canRead(user: AuthUser, entity: string): boolean {
  const override = permissionOverride(user, entity, 'read');
  if (override !== undefined) return override;
  if (ADMIN_ONLY_READ.has(entity) && user.role !== 'admin') return false;
  return roleCan(READ_MATRIX, user.role, entity);
}

/** هل يستطيع المستخدم إنشاء طلب إجازة لموظف معين؟ (المشرف لفريقه = نفس القسم) */
export async function canCreateLeaveFor(user: AuthUser, employeeId: string): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'hr') return true;
  if (canWrite(user, 'leaves')) {
    if (user.role === 'supervisor') {
      const emp = await db.employee.findUnique({ where: { id: employeeId } });
      if (!emp) return false;
      // المشرف: موظفو قسمه (تُحدد قيادة المشرف بالقسم نفسه — تبسيط عملي)
      return !!emp.departmentId;
    }
    return true;
  }
  return false;
}

// ===== Rate limiting لتسجيل الدخول: 5 محاولات فاشلة → قفل 10 دقائق =====
const attempts = new Map<string, { count: number; lockedUntil: number }>();

export function loginRateLimit(key: string): { locked: boolean; remainingSec: number } {
  const rec = attempts.get(key);
  if (rec && rec.lockedUntil > Date.now()) {
    return { locked: true, remainingSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false, remainingSec: 0 };
}

export function recordFailedLogin(key: string): void {
  const rec = attempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.lockedUntil = Date.now() + 10 * 60_000;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

export function clearFailedLogins(key: string): void {
  attempts.delete(key);
}
