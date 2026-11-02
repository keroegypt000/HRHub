// lib/crud.ts — مصنع CRUD موحد: قائمة/إنشاء/تعديل/حذف + تدقيق + نقطة استعادة لكل كتابة
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthUser } from '@/lib/auth';
import { HttpError, ok } from '@/lib/api';
import { logAudit, diffChanges } from '@/lib/audit';
import { createRestorePoint } from '@/lib/restores';

interface ModelDelegate {
  findMany(args?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args?: Record<string, unknown>): Promise<number>;
}

function delegate(model: string): ModelDelegate {
  const map = db as unknown as Record<string, ModelDelegate>;
  const d = map[model];
  if (!d) throw new HttpError(500, `نموذج غير معروف: ${model}`);
  return d;
}

// ===== تصحيح أنواع البيانات حسب الـ Schema (DMMF) =====
// الفورم يرسل نصوصًا من الـ inputs — نحوّلها لما يتوقعه Prisma:
// أرقام Int/Float من نصوص، '' → null للحقول القابلة للفراغ، وتجاهل null للحقول الإجبارية
const MODEL_SCALARS: Record<string, Map<string, { type: string; required: boolean; hasDefault: boolean }>> = {};
for (const m of Prisma.dmmf.datamodel.models) {
  MODEL_SCALARS[m.name.toLowerCase()] = new Map(
    m.fields
      .filter((f) => f.kind === 'scalar')
      .map((f) => [f.name, { type: String(f.type), required: f.isRequired, hasDefault: f.hasDefault }])
  );
}

const NUMERIC_TYPES = new Set(['Int', 'Float', 'BigInt', 'Decimal']);

export function sanitizeData(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const fields = MODEL_SCALARS[model.toLowerCase()];
  if (!fields) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const f = fields.get(k);
    if (!f) { out[k] = v; continue; } // حقول غير معروفة أو علاقات متداخلة — تُمرر كما هي
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      if (f.required) continue; // حقل إجباري بقيمة فارغة — يُقصى (الافتراضي يعمل أو التحقق يرفض برسالة واضحة)
      out[k] = null;
      continue;
    }
    if (NUMERIC_TYPES.has(f.type) && typeof v === 'string') {
      const s = v.trim();
      if (s === '') { if (!f.required) out[k] = null; continue; }
      const n = Number(s);
      if (Number.isFinite(n)) { out[k] = f.type === 'Int' || f.type === 'BigInt' ? Math.round(n) : n; continue; }
      if (!f.required) { out[k] = null; continue; }
      continue; // قيمة غير رقمية لحقل إجباري — التحقق الأعلى يعرض رسالة مناسبة
    }
    if (f.type === 'Boolean' && typeof v === 'string') {
      out[k] = v === 'true' || v === 'نعم' || v === '1';
      continue;
    }
    out[k] = v;
  }
  return out;
}

export interface CrudConfig {
  model: string;
  entity: string; // اسم الكيان للصلاحيات والتدقيق
  label: string; // الاسم العربي للسجل في التدقيق
  searchFields?: string[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** تجهيز البيانات قبل الإنشاء */
  beforeCreate?: (data: Record<string, unknown>, user: AuthUser) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** تجهيز البيانات قبل التعديل */
  beforeUpdate?: (data: Record<string, unknown>, existing: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** وصف عربي للسجل (يظهر في التدقيق) */
  describe?: (row: Record<string, unknown>) => string;
  /** التحقق من صحة البيانات */
  validate?: (data: Record<string, unknown>, mode: 'create' | 'update') => Promise<string | null> | string | null;
  /** حقول تاريخ تحتاج تحويل ISO → Date */
  dateFields?: string[];
  /** ما بعد الحذف */
  afterDelete?: (row: Record<string, unknown>) => Promise<void>;
}

function toDate(data: Record<string, unknown>, fields: string[]): void {
  for (const f of fields || []) {
    const v = data[f];
    if (typeof v === 'string' && v) {
      // تواريخ اليوم الواحد تُخزن منتصف ليل الكويت (+3) لاتساق المقارنات مع kuwaitMidnight
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) data[f] = new Date(`${v}T00:00:00.000+03:00`);
      else data[f] = new Date(v);
    } else if (v === '' || v === null) data[f] = null;
  }
}

function stripSystemFields(data: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...data };
  delete clone.id;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone;
}

// ===== LIST =====
export async function crudList(
  req: NextRequest,
  user: AuthUser,
  cfg: CrudConfig
): Promise<NextResponse> {
  const d = delegate(cfg.model);
  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 2000);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);

  const where: Record<string, unknown> = {};
  if (search && cfg.searchFields?.length) {
    where.OR = cfg.searchFields.map((f) => ({ [f]: { contains: search } }));
  }
  // فلاتر عامة: أي معامل with=someField يعمل كفلتر مساواة
  for (const [key, value] of url.searchParams.entries()) {
    if (['search', 'limit', 'page'].includes(key)) continue;
    if (value === '' || value === 'all') continue;
    where[key] = value;
  }

  const rows = await d.findMany({
    where,
    include: cfg.include,
    orderBy: cfg.orderBy || { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
  const total = await d.count({ where });
  return ok({ rows, total, page, limit });
}

// ===== CREATE =====
export async function crudCreate(
  req: NextRequest,
  user: AuthUser,
  cfg: CrudConfig
): Promise<NextResponse> {
  const d = delegate(cfg.model);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'تحقق من البيانات المرسلة');
  }
  let data = stripSystemFields(body);
  if (cfg.dateFields) toDate(data, cfg.dateFields);
  const err = cfg.validate ? await cfg.validate(data, 'create') : null;
  if (err) throw new HttpError(400, err);
  if (cfg.beforeCreate) data = await cfg.beforeCreate(data, user);
  data = sanitizeData(cfg.model, data);

  const row = await d.create({ data, include: cfg.include });
  const name = cfg.describe ? cfg.describe(row) : String(row.name || row.id);
  await logAudit({
    userId: user.id, action: 'create', entity: cfg.entity, entityId: row.id as string,
    changes: { after: data }, description: `إنشاء ${cfg.label}: ${name}`,
  });
  await createRestorePoint(user.id, `إنشاء ${cfg.label}: ${name}`);
  return ok(row, 201);
}

// ===== UPDATE =====
export async function crudUpdate(
  req: NextRequest,
  user: AuthUser,
  cfg: CrudConfig,
  id: string
): Promise<NextResponse> {
  const d = delegate(cfg.model);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'تحقق من البيانات المرسلة');
  }
  const existing = await d.findUnique({ where: { id }, include: cfg.include });
  if (!existing) throw new HttpError(404, 'السجل غير موجود');

  let data = stripSystemFields(body);
  if (cfg.dateFields) toDate(data, cfg.dateFields);
  const err = cfg.validate ? await cfg.validate(data, 'update') : null;
  if (err) throw new HttpError(400, err);
  if (cfg.beforeUpdate) data = await cfg.beforeUpdate(data, existing);
  data = sanitizeData(cfg.model, data);

  const row = await d.update({ where: { id }, data, include: cfg.include });
  const name = cfg.describe ? cfg.describe(row) : String(row.name || id);
  await logAudit({
    userId: user.id, action: 'update', entity: cfg.entity, entityId: id,
    changes: { before: existing, after: data, diff: diffChanges(existing, data) },
    description: `تعديل ${cfg.label}: ${name}`,
  });
  await createRestorePoint(user.id, `تعديل ${cfg.label}: ${name}`);
  return ok(row);
}

// ===== DELETE =====
export async function crudDelete(
  _req: NextRequest,
  user: AuthUser,
  cfg: CrudConfig,
  id: string
): Promise<NextResponse> {
  const d = delegate(cfg.model);
  const existing = await d.findUnique({ where: { id }, include: cfg.include });
  if (!existing) throw new HttpError(404, 'السجل غير موجود');
  const name = cfg.describe ? cfg.describe(existing) : String(existing.name || id);
  await d.delete({ where: { id } });
  if (cfg.afterDelete) await cfg.afterDelete(existing);
  await logAudit({
    userId: user.id, action: 'delete', entity: cfg.entity, entityId: id,
    changes: { before: existing }, description: `حذف ${cfg.label}: ${name}`,
  });
  await createRestorePoint(user.id, `حذف ${cfg.label}: ${name}`);
  return ok({ deleted: true });
}

/** حذف سجل خام للبصمة — حق للمدير فقط مع تدقيق (قاعدة العمل 2) */
export async function deleteRawAttendanceLog(req: NextRequest, id: string): Promise<NextResponse> {
  const user = (await req.json().catch(() => ({}))) as { __userId?: string };
  void user;
  const log = await db.attendanceLog.findUnique({ where: { id }, include: { employee: true } });
  if (!log) throw new HttpError(404, 'السجل غير موجود');
  await db.attendanceLog.delete({ where: { id } });
  return ok({ deleted: true });
}
