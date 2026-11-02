// اختبار تحمّل الاستيراد لصيغة التصدير القديمة (اللي كانت تفشل برسالة PIN)
const BASE = 'http://localhost:3000';
let token = '';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${String(data).slice(0, 200)}`);
  return data;
}

async function main() {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
  token = login.token;
  console.log('✅ دخول ناجح\n');

  // ===== 1) صيغة الموظفين القديمة: PIN بدل PIN البصمة + المسمى بدل المسمى الوظيفي =====
  const oldEmpRows = [
    { 'الرقم الوظيفي': '1001', 'الاسم': 'أحمد محمد السالم', 'PIN': '1001', 'المسمى': 'محاسب أول', 'الحالة': 'نشط', 'تاريخ التعيين': '15/01/2024' },
  ];
  const r1 = await api('/api/import/excel?entity=employees', { method: 'POST', body: JSON.stringify({ fileName: 'old-format.xlsx', rows: oldEmpRows }) });
  console.log(`1) موظفون بصيغة قديمة: نجح ${r1.success} / فشل ${r1.failed}`);
  r1.results.forEach((x) => console.log(`   صف ${x.row}: ${x.ok ? '✅' : '❌'} ${x.message}`));

  // ===== 2) صيغة سجل البصمة القديمة: التاريخ + الوقت منفصلين وPIN مجرد =====
  // نستخدم سجلة موجودة مسبقًا → النتيجة المتوقعة "سجلة مكررة" مش "PIN مطلوب" — ده يثبت إن الحل نجح
  const oldLogRows = [
    { 'التاريخ': '2026-11-02', 'الوقت': '17:30', 'PIN': '1001', 'الجهاز': 'MAIN-DOOR', 'الحالة': 'خروج' },
    { 'التاريخ': '2026-11-02', 'الوقت': '17:10', 'PIN': '1001', 'الجهاز': 'MAIN-DOOR', 'الحالة': 'دخول' },
  ];
  const r2 = await api('/api/import/excel?entity=attendance-logs', { method: 'POST', body: JSON.stringify({ fileName: 'old-logs.xlsx', rows: oldLogRows }) });
  console.log(`\n2) سجل بصمة بصيغة قديمة (سجلات مكررة عمدًا): نجح ${r2.success} / فشل ${r2.failed}`);
  r2.results.forEach((x) => console.log(`   صف ${x.row}: ${x.ok ? '✅' : '⚠️'} ${x.message}`));
  const pinError = r2.results.some((x) => !x.ok && x.message.includes('PIN ووقت السجلة مطلوبان'));
  const mapped = r2.results.every((x) => x.ok || x.message.includes('مكررة'));
  console.log(pinError ? '   ❌ ما زالت رسالة PIN تظهر!' : '   ✅ الحل لمشكلة PIN شغال — التكرار فقط هو المتوقع');

  // ===== 3) تاريخ بصيغة Excel التسلسلية ورقم =====
  const serialRows = [
    { 'الرقم الوظيفي': '1002', 'الاسم': 'تجربة تاريخ تسلسلي', 'تاريخ التعيين': 45306, 'الراتب الأساسي': '500' },
  ];
  const r3 = await api('/api/import/excel?entity=employees', { method: 'POST', body: JSON.stringify({ fileName: 'serial-date.xlsx', rows: serialRows }) });
  console.log(`\n3) تاريخ Excel تسلسلي (45306): نجح ${r3.success} / فشل ${r3.failed}`);
  r3.results.forEach((x) => console.log(`   صف ${x.row}: ${x.ok ? '✅' : '❌'} ${x.message}`));
  const emp = await api('/api/employees?search=1002').catch(() => null);
  if (Array.isArray(emp) && emp.length) {
    const e = emp.find((x) => x.code === '1002');
    if (e && e.hireDate) console.log(`   التاريخ المحفوظ: ${String(e.hireDate).slice(0, 10)} (المتوقع: 2024-01-05 تقريبًا حسب النظام)`);
  }

  console.log('\n🎉 اختبارات الصيغ القديمة انتهت');
}

main().catch((e) => { console.error('💥', e.message); process.exit(1); });
