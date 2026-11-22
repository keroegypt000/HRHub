// HRHub — النسخة المكتبية (Windows)
// يشغّل سيرفر النظام + قاعدة بيانات SQLite محلية على نفس الجهاز، ويفتح نافذة البرنامج.
// السيرفر يستمع على الشبكة الداخلية (0.0.0.0) لكي:
//   • تفتح أجهزة الموظفين الأخرى النظام من المتصفح: http://IP-الجهاز:3000
//   • ترسل أجهزة ZKTeco بصماتها (ADMS) إلى نفس العنوان، ويسحب النظام من أجهزة ACTAtek/ZKTeco تلقائيًا
// إغلاق النافذة يخفيها في شريط المهام (السيرفر يظل يعمل لاستقبال البصمات)، والخروج من أيقونة الشريط.
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const RES = app.isPackaged ? path.join(process.resourcesPath, 'app-server') : path.join(__dirname, 'app');
const DATA = process.env.HRHUB_DATA || path.join(process.env.ProgramData || app.getPath('userData'), 'HRHub');
const DB_FILE = path.join(DATA, 'hrhub.db');
const LOG_DIR = path.join(DATA, 'logs');
const BACKUP_DIR = path.join(DATA, 'backups');
const ICON = path.join(__dirname, 'icon.png');
const VERSION = app.getVersion();
const APP_NAME = 'Ad Mas';
const TITLE = `${APP_NAME} — الإصدار ${VERSION}`;

let win = null; let tray = null; let server = null; let quitting = false;
let config = null;

function ensureDirs() { for (const d of [DATA, LOG_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true }); }

/** إعدادات ثابتة: المنفذ + مفتاح التشفير (يُولد مرة واحدة ولا يتغير أبدًا) */
function loadConfig() {
  const file = path.join(DATA, 'config.json');
  let c = {};
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let changed = false;
  if (!c.port) { c.port = 3000; changed = true; }
  if (!c.appSecret) { c.appSecret = crypto.randomBytes(32).toString('hex'); changed = true; }
  if (c.autoPullMinutes === undefined) { c.autoPullMinutes = 5; changed = true; }
  if (changed) fs.writeFileSync(file, JSON.stringify(c, null, 2));
  return c;
}

function log(line) {
  try { fs.appendFileSync(path.join(LOG_DIR, 'server.log'), `[${new Date().toISOString()}] ${line}\n`); } catch {}
}

function serverEnv() {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(config.port),
    HOSTNAME: '0.0.0.0',
    DATABASE_URL: `file:${DB_FILE.replace(/\\/g, '/')}`,
    APP_SECRET: config.appSecret,
    HRHUB_AUTOPULL_MINUTES: String(config.autoPullMinutes || 0),
    HRHUB_DESKTOP: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    CHECKPOINT_DISABLE: '1',
  };
}

/** نسخة احتياطية تلقائية يوميًا (آخر 30 نسخة) */
function backup(manual = false) {
  if (!fs.existsSync(DB_FILE)) return null;
  const stamp = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const name = `hrhub-${manual ? 'manual-' : ''}${stamp}.db`;
  const today = stamp.slice(0, 8);
  const existing = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
  if (!manual && existing.some((f) => f.includes(`-${today}`) && !f.includes('manual'))) return null;
  const dest = path.join(BACKUP_DIR, name);
  fs.copyFileSync(DB_FILE, dest);
  const auto = existing.filter((f) => !f.includes('manual'));
  for (const old of auto.slice(0, Math.max(0, auto.length - 29))) { try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {} }
  return dest;
}

/** إنشاء/تحديث جداول قاعدة البيانات حسب نسخة البرنامج (prisma db push — لا يحذف بيانات) */
function syncDatabase() {
  return new Promise((resolve) => {
    const cli = path.join(RES, 'prisma-cli', 'node_modules', 'prisma', 'build', 'index.js');
    const schema = path.join(RES, 'prisma', 'schema.prisma');
    if (!fs.existsSync(cli)) { log('prisma cli missing — skip db sync'); return resolve(true); }
    const env = serverEnv();
    const engine = fs.readdirSync(path.join(RES, 'prisma-cli', 'node_modules', '@prisma', 'engines')).find((f) => /^schema-engine.*\.exe$/.test(f));
    if (engine) env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(RES, 'prisma-cli', 'node_modules', '@prisma', 'engines', engine);
    const p = spawn(process.execPath, [cli, 'db', 'push', '--skip-generate', '--schema', schema], { env, windowsHide: true, cwd: DATA });
    let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => { log(`db push (${code}): ${out.trim()}`); resolve(code === 0 ? true : out); });
  });
}

function startServer() {
  const cwd = path.join(RES, 'server');
  server = spawn(process.execPath, [path.join(cwd, 'server.js')], { env: serverEnv(), cwd, windowsHide: true });
  server.stdout.on('data', (d) => log(String(d).trim()));
  server.stderr.on('data', (d) => log(`ERR ${String(d).trim()}`));
  server.on('exit', (code) => {
    log(`server exited ${code}`);
    server = null;
    if (!quitting) setTimeout(startServer, 3000); // إعادة تشغيل تلقائية لو توقف
  });
}

function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port: config.port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        again();
      });
      req.on('error', again); req.on('timeout', () => { req.destroy(); });
    };
    const again = () => (Date.now() - started > timeoutMs ? resolve(false) : setTimeout(tryOnce, 700));
    tryOnce();
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${config.port}`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1000, minHeight: 640, show: false,
    title: TITLE, icon: ICON, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, 'splash.html'), { query: { v: VERSION } });
  // عنوان النافذة يظل يحمل رقم الإصدار حتى بعد تحميل النظام
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(TITLE); });
  win.once('ready-to-show', () => win.show());
  // نوافذ الطباعة (window.open فارغة) تُفتح داخل البرنامج، والروابط الخارجية في المتصفح
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith(`http://127.0.0.1:${config.port}`)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (tray && !config.trayHintShown) {
      tray.displayBalloon?.({ title: `${APP_NAME} يعمل في الخلفية`, content: `النظام مستمر في استقبال البصمات. افتحه أو اخرج منه من أيقونة ${APP_NAME} بجوار الساعة.` });
      config.trayHintShown = true;
      fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(config, null, 2));
    }
  });
}

function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(`${APP_NAME} ${VERSION} — نظام الموارد البشرية`);
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${APP_NAME} — الإصدار ${VERSION}`, enabled: false },
    { type: 'separator' },
    { label: `فتح ${APP_NAME}`, click: showWindow },
    { label: 'فتح في المتصفح', click: () => shell.openExternal(`http://127.0.0.1:${config.port}`) },
    { label: 'عناوين الشبكة (للأجهزة والموظفين)', click: () => dialog.showMessageBox({ type: 'info', title: APP_NAME, message: 'افتح النظام من أي جهاز على نفس الشبكة:', detail: `${lanAddresses().join('\n') || 'لا توجد شبكة'}\n\nوعنوان سيرفر ADMS لأجهزة ZKTeco: نفس الـ IP والمنفذ ${config.port}` }) },
    { type: 'separator' },
    { label: 'نسخة احتياطية الآن', click: () => { const f = backup(true); dialog.showMessageBox({ type: 'info', message: f ? `تم حفظ النسخة:\n${f}` : 'لا توجد بيانات بعد' }); } },
    { label: 'فتح مجلد البيانات والنسخ', click: () => shell.openPath(DATA) },
    { label: 'التشغيل مع ويندوز', type: 'checkbox', checked: login, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'خروج نهائي (إيقاف استقبال البصمات)', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showWindow);
}

app.on('second-instance', showWindow);
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { quitting = true; if (server) server.kill(); });

app.whenReady().then(async () => {
  ensureDirs();
  config = loadConfig();
  log(`HRHub desktop ${app.getVersion()} — data: ${DATA}`);
  buildTray();
  const hidden = process.argv.includes('--hidden');
  if (!hidden) createWindow();

  try { backup(false); } catch (e) { log(`backup failed: ${e}`); }
  const synced = await syncDatabase();
  if (synced !== true) {
    dialog.showErrorBox(APP_NAME, `تعذر تحديث قاعدة البيانات. البيانات لم تُمس.\n\nالتفاصيل في:\n${path.join(LOG_DIR, 'server.log')}`);
  }
  startServer();
  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox(APP_NAME, `لم يبدأ السيرفر على المنفذ ${config.port}.\nربما برنامج آخر يستخدم نفس المنفذ — غيّر "port" في:\n${path.join(DATA, 'config.json')}`);
    return;
  }
  if (win) win.loadURL(`http://127.0.0.1:${config.port}`);
});
