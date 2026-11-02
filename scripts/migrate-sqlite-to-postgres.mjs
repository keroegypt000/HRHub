#!/usr/bin/env node
/**
 * ترحيل البيانات من النسخة المحلية القديمة (SQLite: db/custom.db)
 * إلى قاعدة Prisma Postgres / PostgreSQL الجديدة.
 *
 * الاستخدام:
 *   1) npx prisma generate --schema prisma/schema-sqlite.prisma   (مرة واحدة)
 *   2) node scripts/migrate-sqlite-to-postgres.mjs "postgresql://user:pass@db.prisma.io:5432/postgres?sslmode=require"
 *
 * - يتعامل مع نسخة مؤقتة من ملف SQLite (الأصل لا يُلمس إطلاقًا) ويضيف عليها أعمدة الجداول الجديدة.
 * - ينشئ الجداول في القاعدة الجديدة تلقائيًا (prisma db push).
 * - العلاقات الذاتية والمتبادلة (Department↔نفسها، Contract↔نفسها، Employee↔FileUpload)
 *   تُنسخ على مرحلتين: إدخال بدون المرجع ثم استكمال المرجع.
 * - كل صف مرفوض يُطبع مع سببه — لا ابتلاع صامت.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require_ = createRequire(import.meta.url);

const pgUrl = process.argv[2] || process.env.DATABASE_URL || '';
if (!pgUrl || !/postgres/.test(pgUrl)) {
  console.error('❌ مرّر رابط Prisma Postgres: node scripts/migrate-sqlite-to-postgres.mjs "postgresql://..."');
  process.exit(1);
}
process.env.DATABASE_URL = pgUrl;

async function main() {
  // ① نسخة مؤقتة من SQLite — الأصل لا يُلمس
  const sqliteUrlEnv = process.env.SQLITE_URL || 'file:./db/custom.db';
  const srcPath = path.resolve(process.cwd(), sqliteUrlEnv.replace(/^file:/, ''));
  const tmpDb = path.join(process.cwd(), 'db', 'migrate-copy.db');
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ ملف SQLite غير موجود: ${srcPath}`);
    process.exit(1);
  }
  console.log(`① نسخة مؤقتة من قاعدة SQLite (الأصل لا يُلمس): ${srcPath}`);
  fs.copyFileSync(srcPath, tmpDb);
  process.env.SQLITE_URL = `file:${tmpDb}`;

  // ② مزامنة النسخة مع آخر schema (تضيف أعمدة الجداول الجديدة على النسخة فقط)
  console.log('② مزامنة النسخة مع آخر schema SQLite (أعمدة جديدة على النسخة فقط)...');
  execSync('npx prisma db push --skip-generate --schema prisma/schema-sqlite.prisma', { stdio: 'inherit' });

  // ③ إنشاء الجداول في قاعدة Postgres
  console.log('③ إنشاء الجداول في القاعدة الجديدة (prisma db push)...');
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

  console.log('④ فتح قاعدتي المصدر والهدف...');
  const sqlite = require_('../node_modules/.prisma/client-sqlite');
  const sqliteClient = new sqlite.PrismaClient({
    datasources: { db: { url: process.env.SQLITE_URL } },
  });
  const { PrismaClient } = require_('@prisma/client');
  const pg = new PrismaClient();

  // الحقول العددية لكل موديل من الـ DMMF (بدون العلاقات)
  const scalarFields = {};
  for (const m of sqlite.Prisma.dmmf.datamodel.models) {
    scalarFields[m.name] = m.fields.filter((f) => f.kind !== 'object').map((f) => f.name);
  }

  // ترتيب آمن: الجلسات القديمة تُتجاهل
  const ORDER = [
    'Setting', 'User', 'Department', 'Position', 'Device', 'Shift',
    'Employee', 'FileUpload', 'Contract', 'ShiftAssignment', 'LeaveType', 'Holiday',
    'SalaryComponent', 'PayrollPeriod', 'Payslip', 'PayslipItem',
    'AttendanceLog', 'DailyAttendance', 'LeaveRequest',
    'Passport', 'Vehicle', 'CompanyContract', 'DepartureSettlement',
    'AuditLog', 'RestorePoint', 'ImportLog',
  ];

  // علاقات ذاتية/متبادلة تُستكمل بعد إدخال كل الصفوف
  const BACKFILL_FIELDS = {
    Department: ['parentId'],
    Contract: ['renewalOfId'],
    Employee: ['photoId'],
    FileUpload: ['employeeId'],
  };

  const report = [];
  const failed = [];
  const deferredRows = {}; // model → rows (للاستكمال)

  try {
    for (const model of ORDER) {
      const lower = model.charAt(0).toLowerCase() + model.slice(1);
      const src = sqliteClient[lower];
      const dst = pg[lower];
      if (!src || !dst) { report.push([model, '—', 'غير موجود']); continue; }
      const rows = await src.findMany({ take: 200000 });
      const fields = scalarFields[model];
      const strip = BACKFILL_FIELDS[model] || [];

      // المرحلة 1: إدخال الصفوف مع تجاهل حقول العلاقات المؤجلة
      const clean = rows.map((r) => {
        const o = {};
        for (const f of fields) {
          if (strip.includes(f)) continue;
          o[f] = r[f];
        }
        return o;
      });

      let inserted = 0;
      for (let i = 0; i < clean.length; i += 200) {
        const chunk = clean.slice(i, i + 200);
        try {
          const res = await dst.createMany({ data: chunk, skipDuplicates: true });
          inserted += res.count;
        } catch (e) {
          console.warn(`   ⚠ فشلت دفعة ${model} (${e.code || ''} ${String(e.message).slice(0, 90)}) — إدخال صفًا صفًا...`);
          for (const row of chunk) {
            try { await dst.create({ data: row }); inserted++; }
            catch (rowErr) {
              const dup = rowErr.code === 'P2002' || /Unique constraint/i.test(rowErr.message || '');
              if (!dup) {
                failed.push([model, row.id || '?', `${rowErr.code || ''} ${String(rowErr.message).slice(0, 130)}`]);
                console.warn(`   ✗ ${model} id=${row.id || '?'}: ${rowErr.code || ''} ${String(rowErr.message).slice(0, 130)}`);
              }
            }
          }
        }
      }
      if (strip.length && rows.length) deferredRows[model] = rows;

      report.push([model, rows.length, inserted]);
    }

    // المرحلة 2: استكمال العلاقات المؤجلة (ذاتية + متبادلة)
    for (const [model, rows] of Object.entries(deferredRows)) {
      const lower = model.charAt(0).toLowerCase() + model.slice(1);
      const dst = pg[lower];
      const strip = BACKFILL_FIELDS[model] || [];
      let fixed = 0, broken = 0;
      for (const r of rows) {
        for (const f of strip) {
          if (r[f] == null) continue;
          try {
            await dst.update({ where: { id: r.id }, data: { [f]: r[f] } });
            fixed++;
          } catch (e) {
            broken++;
            console.warn(`   ✗ استكمال ${model}.${f} id=${r.id} → ${r[f]}: ${e.code || ''} ${String(e.message).slice(0, 90)}`);
          }
        }
      }
      if (fixed || broken) console.log(`   ↻ ${model}: استُكمت ${fixed} علاقة مؤجلة${broken ? ` — فشل ${broken}` : ''}`);
    }
  } finally {
    await sqliteClient.$disconnect().catch(() => {});
    await pg.$disconnect().catch(() => {});
    // حذف النسخة المؤقتة
    try { fs.unlinkSync(tmpDb); } catch {}
  }

  console.log('\n⑤ تقرير الترحيل (موديل | في SQLite | أُدخل):');
  for (const [m, a, b] of report) console.log(`   ${m.padEnd(22)} ${String(a).padStart(6)} → ${String(b).padStart(6)}`);

  if (failed.length) {
    console.log(`\n⚠ صفوف مرفوضة (${failed.length}) — راجعها قبل الاعتماد على الترحيل:`);
    for (const [m, id, why] of failed.slice(0, 50)) console.log(`   ${m} id=${id}: ${why}`);
  }
  console.log('\n✅ اكتمل. افتح النظام وسجّل الدخول — لو مفيش مستخدمين، ظهرت شاشة الإعداد الأول.');
  console.log('   بعد الترحيل: افتح /api/health للتأكد من كل الجداول، وأعد حساب فترة الرواتب المعلقة.');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
