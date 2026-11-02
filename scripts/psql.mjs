// سكربت SQL مساعد للاختبار المحلي: node psql.mjs "SELECT ..." [--file path]
import pg from 'pg';

const sqlText = process.argv[2] || '';
const db = new pg.Client({ host: '127.0.0.1', port: 5544, user: 'postgres', database: 'hrhub' });
await db.connect();
try {
  const res = await db.query(sqlText);
  if (res.fields?.length) {
    console.log(res.fields.map((f) => f.name).join(' | '));
    console.log('-'.repeat(40));
  }
  for (const row of res.rows) console.log(Object.values(row).map((v) => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' | '));
  if (res.rowCount != null && !res.fields?.length) console.log(`(${res.rowCount} rows)`);
} finally {
  await db.end();
}
