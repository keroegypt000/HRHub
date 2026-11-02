// اختبار توافق الاستيراد/التصدير round-trip على السيرفر المحلي
// 1) دخول admin 2) تصدير كل كيان 3) التحقق من وجود أعمدة الاستيراد 4) استيراد فعلي آمن (employees/devices/shifts)
import * as XLSX from 'xlsx';

const BASE = 'http://localhost:3000';
let token = '';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function pick(r, keys) {
  for (const k of keys) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

const NEED = {
  employees: { required: [['الرقم الوظيفي'], ['الاسم'], ['PIN البصمة', 'PIN']], optional: [] },
  devices: { required: [['الرقم التسلسلي'], ['الاسم']], optional: [] },
  shifts: { required: [['الاسم'], ['سماحية التأخير (دقيقة)', 'سماحية التأخير']], optional: [] },
  holidays: { required: [['الاسم'], ['التاريخ']], optional: [] },
  'attendance-logs': { required: [['الرقم الوظيفي (PIN)', 'PIN'], ['وقت السجلة']], optional: [] },
};

async function main() {
  // دخول
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
  token = login.token;
  console.log('✅ دخول ناجح');

  const entities = ['employees', 'devices', 'shifts', 'holidays', 'attendance-logs'];
  let allOk = true;

  for (const entity of entities) {
    // تصدير
    const res = await fetch(`${BASE}/api/export?entity=${entity}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { console.log(`❌ ${entity}: فشل التصدير ${res.status}`); allOk = false; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    console.log(`\n📄 ${entity}: ${rows.length} صف مصدَّر — الأعمدة: ${rows.length ? Object.keys(rows[0]).join(' | ') : '(فارغ)'}`);

    if (!rows.length) { console.log(`⚠️ ${entity}: لا صفوف — تخطي`); continue; }

    // تحقق من الأعمدة المطلوبة للاستيراد
    const need = NEED[entity];
    const headers = Object.keys(rows[0]);
    let colsOk = true;
    for (const alternatives of need.required) {
      const found = alternatives.some((k) => headers.includes(k));
      if (!found) { console.log(`   ❌ عمود مطلوب غير موجود: ${alternatives.join('/')}`); colsOk = false; }
    }
    if (!colsOk) allOk = false;

    // محاكاة منطق الاستيراد على أول 3 صفوف: هل pick يعيد القيم المطلوبة؟
    const sample = rows.slice(0, 3);
    for (const [idx, r] of sample.entries()) {
      if (entity === 'attendance-logs') {
        const pin = pick(r, ['الرقم الوظيفي (PIN)', 'PIN', 'pin', 'الرقم']);
        const timeStr = pick(r, ['وقت السجلة', 'وقت البصمة']);
        const d = pick(r, ['التاريخ']); const t = pick(r, ['الوقت']);
        const resolved = timeStr || (d && t ? `${d} ${t}` : '');
        console.log(`   صف ${idx + 1}: PIN=${pin} وقت=${resolved}${resolved ? '' : ' ← لا يمكن الحل!'}`);
        if (!pin || !resolved) { console.log(`   ❌ فشل حل بيانات الصف`); allOk = false; }
      } else if (entity === 'employees') {
        const code = pick(r, ['الرقم الوظيفي']);
        const pin = pick(r, ['PIN البصمة', 'PIN']) || code;
        const pos = pick(r, ['المسمى الوظيفي', 'المسمى']);
        const hire = pick(r, ['تاريخ التعيين']);
        console.log(`   صف ${idx + 1}: ${code} — PIN=${pin} — مسمى=${pos || '—'} — تعيين=${hire || '—'}`);
        if (!code || !pin) allOk = false;
      }
    }

    // استيراد فعلي آمن: employees (تحديث فقط) + devices/shifts (upsert)
    if (entity === 'employees' || entity === 'devices' || entity === 'shifts') {
      const BATCH = 300;
      let success = 0, failed = 0;
      const firstErrors = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const out = await api(`/api/import/excel?entity=${entity}`, {
          method: 'POST',
          body: JSON.stringify({ fileName: `roundtrip-${entity}.xlsx`, rows: chunk }),
        });
        success += out.success; failed += out.failed;
        out.results.filter((x) => !x.ok).slice(0, 3).forEach((x) => firstErrors.push(`صف ${x.row}: ${x.message}`));
      }
      console.log(`   ♻️ استيراد الملف المصدَّر: نجح ${success} / فشل ${failed} من ${rows.length}`);
      if (failed > 0) { firstErrors.forEach((e) => console.log(`   ✖ ${e}`)); allOk = false; }
      else console.log(`   ✅ round-trip كامل بلا أي خطأ`);
    }
  }

  console.log(allOk ? '\n🎉 النتيجة: كل الاختبارات نجحت — التصدير يعود استيرادًا بلا أخطاء' : '\n💥 يوجد إخفاقات — راجع الأعلى');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('💥', e.message); process.exit(1); });
