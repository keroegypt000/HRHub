// تشغيل PostgreSQL مدمج للاختبار المحلي (بدون صلاحيات root)
import EmbeddedPostgres from 'embedded-postgres';

const DATA_DIR = '/tmp/pgserver/data';
const PORT = 5433;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'hrhub',
    password: 'hrhub123',
    port: PORT,
    persistent: true, // نحافظ على البيانات بين التشغيلات داخل نفس الجلسة
    onLog: () => {},  // ن silence logs
    onError: (m) => console.error('[pg]', m),
  });

  // إنشاء التهيئة إذا أول مرة
  try {
    await pg.initialise();
    console.log('[pg] initialised');
  } catch (e) {
    console.log('[pg] initialise skipped:', e.message);
  }
  await pg.start();
  try {
    await pg.createDatabase('hrhub');
    console.log('[pg] database hrhub created');
  } catch (e) {
    console.log('[pg] db exists:', e.message);
  }
  console.log(`[pg] READY postgres://hrhub:hrhub123@127.0.0.1:${PORT}/hrhub`);
  // نبقي العملية حية
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => { console.error('[pg] fatal', e); process.exit(1); });
