#!/usr/bin/env node
/**
 * ترحيل البيانات من النسخة المحلية القديمة (SQLite: db/custom.db)
 * إلى قاعدة Prisma Postgres / PostgreSQL الجديدة.
 *
 * الاستخدام:
 *   1) npx prisma generate --schema prisma/schema-sqlite.prisma   (مرة واحدة)
 *   2) node scripts/migrate-sqlite-to-postgres.mjs "postgresql://user:pass@db.prisma.io:5432/postgres?sslmode=require"
 *
 * - ينشئ الجداول في القاعدة الجديدة تلقائيًا (prisma db push).
 * - ينسخ كل الجداول بترتيب آمن للعلاقات، ويتخطى الموجود مسبقًا (قابل للتكرار).
 * - لا يحذف ولا يعدل شيئًا في ملف SQLite الأصلي.
 */
const pgUrl = process.argv[2] || process.env.DATABASE_URL || '';
if (!pgUrl || !/postgres/.test(pgUrl)) {
  console.error('❌ مرّر رابط Prisma Postgres: node scripts/migrate-sqlite-to-postgres.mjs "postgresql://..."');
  process.exit(1);
}
process.env.DATABASE_URL = pgUrl;

const { execSync } = require('node:child_process');

async function main() {
  console.log('① إنشاء الجداول في القاعدة الجديدة (prisma db push)...');
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

  console.log('② فتح قاعدة SQLite المحلية...');
  const sqlite = require('../node_modules/.prisma/client-sqlite');
  const sqliteClient = new sqlite.PrismaClient({
    datasources: { db: { url: process.env.SQLITE_URL || 'file:../db/custom.db' } },
  });
  const { PrismaClient } = require('@prisma/client');
  const pg = new PrismaClient();

  // الحقول العددية لكل موديل من الـ DMMF (بدون العلاقات)
  const scalarFields = {};
  for (const m of sqlite.Prisma.dmmf.datamodel.models) {
    scalarFields[m.name] = m.fields.filter((f) => f.kind !== 'object').map((f) => f.name);
  }

  // ترتيب آمن للعلاقات — الجلسات القديمة تُتجاهل
  const ORDER = [
    'Setting', 'User', 'Department', 'Position', 'Device', 'Shift',
    'Employee', 'Contract', 'ShiftAssignment', 'LeaveType', 'Holiday',
    'SalaryComponent', 'PayrollPeriod', 'Payslip', 'PayslipItem',
    'AttendanceLog', 'DailyAttendance', 'LeaveRequest', 'FileUpload',
    'AuditLog', 'RestorePoint', 'ImportLog',
  ];

  const report = [];
  try {
    for (const model of ORDER) {
      const lower = model.charAt(0).toLowerCase() + model.slice(1);
      const src = sqliteClient[lower];
      const dst = pg[lower];
      if (!src || !dst) { report.push([model, '—', 'غير موجود']); continue; }
      const rows = await src.findMany({ take: 100000 });
      const fields = scalarFields[model];
      const clean = rows.map((r) => {
        const o = {};
        for (const f of fields) o[f] = r[f];
        return o;
      });
      let inserted = 0;
      for (let i = 0; i < clean.length; i += 200) {
        const chunk = clean.slice(i, i + 200);
        try {
          const res = await dst.createMany({ data: chunk, skipDuplicates: true });
          inserted += res.count;
        } catch (e) {
          // فشل الدفعة — إدخال صفًا صفًا لمعرفة السبب دون إيقاف البقية
          for (const row of chunk) {
            try { await dst.create({ data: row }); inserted++; } catch { /* مكرر أو تعارض */ }
          }
        }
      }
      report.push([model, rows.length, inserted]);
    }
  } finally {
    await sqliteClient.$disconnect().catch(() => {});
    await pg.$disconnect().catch(() => {});
  }

  console.log('\n③ تقرير الترحيل (موديل | في SQLite | أُدخل):');
  for (const [m, a, b] of report) console.log(`   ${m.padEnd(20)} ${String(a).padStart(6)} → ${String(b).padStart(6)}`);
  console.log('\n✅ اكتمل. افتح النظام وسجّل الدخول — لو مفيش مستخدمين، ظهرت شاشة الإعداد الأول.');
}

main().catch((e) => { console.error(e); process.exit(1); });
