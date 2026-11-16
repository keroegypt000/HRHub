#!/usr/bin/env node
// بناء النسخة المكتبية (Windows): node scripts/build-desktop.mjs
// 1) نسخة من المشروع في مجلد مؤقت قصير (ويندوز يرفض المسارات الطويلة) بقاعدة SQLite
// 2) next build --webpack (standalone)
// 3) تجميع desktop/app: السيرفر + الملفات الثابتة + schema + Prisma CLI (لإنشاء/تحديث الجداول عند التشغيل)
// 4) electron-builder → desktop/dist/HRHub-Setup-x.y.z.exe
// ملفات .env لا تُنسخ أبدًا (لا أسرار داخل البرنامج)
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = path.join(os.tmpdir(), 'hbd');
const DESK = path.join(ROOT, 'desktop');
const APP = path.join(DESK, 'app');
const skipInstaller = process.argv.includes('--no-installer');

const run = (cmd, cwd, env = {}) => {
  console.log(`\n> ${cmd}   (${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env } });
};
const step = (t) => console.log(`\n=== ${t} ===`);
const EXCLUDE = new Set(['node_modules', '.next', '.git', 'tool-results', '.zscripts', 'mini-services', 'examples']);

step('1) تجهيز نسخة البناء (SQLite)');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const entry of fs.readdirSync(ROOT)) {
  if (EXCLUDE.has(entry) || entry === 'desktop' || entry.startsWith('.env')) continue;
  fs.cpSync(path.join(ROOT, entry), path.join(STAGE, entry), { recursive: true, filter: (src) => !path.basename(src).startsWith('.env') });
}
// نسخة حقيقية من المكتبات (وليس رابطًا): مخرجات standalone يجب أن تحمل نسختها الخاصة بعميل SQLite
// robocopy أسرع بكثير من النسخ العادي لآلاف الملفات الصغيرة
try {
  execSync(`robocopy "${path.join(ROOT, 'node_modules')}" "${path.join(STAGE, 'node_modules')}" /E /NFL /NDL /NJH /NJS /NP /MT:16`, { stdio: 'ignore' });
} catch (e) {
  if ((e.status ?? 8) >= 8) throw e; // robocopy: أقل من 8 = نجاح
}
const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8').replace(/^\uFEFF/, '')
  .replace('provider = "postgresql"', 'provider = "sqlite"');
fs.writeFileSync(path.join(STAGE, 'prisma', 'schema.prisma'), schema);

step('2) بناء النظام');
run('npx prisma generate', STAGE);
run('npx next build --webpack', STAGE);

step('3) تجميع desktop/app');
fs.rmSync(APP, { recursive: true, force: true });
const SERVER = path.join(APP, 'server');
fs.cpSync(path.join(STAGE, '.next', 'standalone'), SERVER, { recursive: true, dereference: true });
fs.cpSync(path.join(STAGE, '.next', 'static'), path.join(SERVER, '.next', 'static'), { recursive: true });
if (fs.existsSync(path.join(STAGE, 'public'))) fs.cpSync(path.join(STAGE, 'public'), path.join(SERVER, 'public'), { recursive: true });
for (const f of fs.readdirSync(SERVER)) if (f.startsWith('.env')) fs.rmSync(path.join(SERVER, f), { force: true });
fs.mkdirSync(path.join(APP, 'prisma'), { recursive: true });
fs.writeFileSync(path.join(APP, 'prisma', 'schema.prisma'), schema);
// محرك SQLite لويندوز لازم يكون موجود داخل السيرفر
const engines = fs.readdirSync(path.join(SERVER, 'node_modules', '.prisma', 'client')).filter((f) => f.includes('query_engine'));
if (!engines.some((f) => f.includes('windows'))) throw new Error('محرك Prisma لويندوز غير موجود في مخرجات السيرفر');
console.log('  محرك Prisma:', engines.join(', '));

const CLI = path.join(APP, 'prisma-cli');
fs.mkdirSync(CLI, { recursive: true });
const prismaVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'prisma', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(CLI, 'package.json'), JSON.stringify({ name: 'hrhub-prisma-cli', private: true, dependencies: { prisma: prismaVersion } }, null, 2));
run('npm install --omit=dev --no-audit --no-fund', CLI);

if (skipInstaller) { console.log('\nتم التجميع (بدون ملف التثبيت).'); process.exit(0); }

step('4) ملف التثبيت');
if (!fs.existsSync(path.join(DESK, 'node_modules', 'electron-builder'))) run('npm install --no-audit --no-fund', DESK);
run('npx electron-builder --win nsis --publish never', DESK);
console.log(`\nجاهز: ${path.join(DESK, 'dist')}`);
