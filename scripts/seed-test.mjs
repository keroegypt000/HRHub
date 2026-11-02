// سكربت تعبئة بيانات اختبار واقعية للتحقق من محرك الرواتب والتنبيهات
// الاستخدام: node scripts/seed-test.mjs
const BASE = 'http://localhost:3000';
const TOKEN = (await import('fs')).readFileSync('/tmp/hrhub.token', 'utf8').trim();

async function api(path, method = 'GET', body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return data;
}

const log = (...a) => console.log('•', ...a);

// ===== 1) جهاز بصمة =====
const dev = await api('/api/devices', 'POST', { sn: 'TEST-SN-0001', name: 'جهاز الاختبار المحلي', mode: 'push', location: 'المكتب الرئيسي' });
log('جهاز:', dev.id || dev.sn);

// ===== 2) موظفون =====
const emps = [
  { code: '101', name: 'أحمد عبدالله الكويتي', nationality: 'كويتي', basicSalary: 800, hireDate: '2024-01-15' },
  { code: '102', name: 'محمد سيد مصطفى', nationality: 'مصري', basicSalary: 400, hireDate: '2025-03-01' },
  { code: '103', name: 'راجيش كومار', nationality: 'هندي', basicSalary: 350, hireDate: '2025-06-10' },
  { code: '104', name: 'فاطمة علي حسن', nationality: 'مصري', basicSalary: 500, hireDate: '2023-09-01' },
  { code: '105', name: 'خالد يوسف المطيري', nationality: 'كويتي', basicSalary: 700, hireDate: '2022-05-20' },
  { code: '106', name: 'سيف الدين حسن', nationality: 'بنغلاديشي', basicSalary: 250, hireDate: '2026-10-15' },
];
const empIds = {};
for (const e of emps) {
  const created = await api('/api/employees', 'POST', {
    code: e.code, name: e.name, nationality: e.nationality, basicSalary: e.basicSalary, hireDate: e.hireDate, status: 'active',
  });
  empIds[e.code] = created.id || created.employee?.id;
  log('موظف:', e.code, e.name, '→', empIds[e.code]);
}

// ===== 3) عقود =====
for (const e of emps) {
  await api('/api/contracts', 'POST', {
    employeeId: empIds[e.code],
    contractNo: `CT-2026-${e.code}`,
    type: 'full_time',
    startDate: e.hireDate,
    basicSalary: e.basicSalary,
    housingAllowance: Math.round(e.basicSalary * 0.15),
    transportAllowance: 50,
    otherAllowance: 0,
    hoursPerDay: 8,
    daysPerWeek: 5,
    status: 'active',
  });
}
log('عقود:', emps.length);

// ===== 4) عطلة رسمية داخل الأيام المحسوبة (1-2 نوفمبر) =====
await api('/api/holidays', 'POST', { name: 'عطلة وطنية تجريبية', date: '2026-11-01', recurring: false });
log('عطلة رسمية: 2026-11-01');

// ===== 5) إجازات معتمدة =====
const leaveTypes = (await api('/api/leave-types')).rows;
const annual = leaveTypes.find((t) => t.code === 'ANNUAL');
const unpaid = leaveTypes.find((t) => t.code === 'UNPAID');
const lv1 = await api('/api/leaves', 'POST', { employeeId: empIds['102'], leaveTypeId: annual.id, fromDate: '2026-11-02', toDate: '2026-11-02', days: 1, reason: 'إجازة سنوية' });
await api(`/api/leaves/${lv1.id}`, 'PATCH', { action: 'approve' });
const lv2 = await api('/api/leaves', 'POST', { employeeId: empIds['103'], leaveTypeId: unpaid.id, fromDate: '2026-11-02', toDate: '2026-11-02', days: 1, reason: 'ظرف شخصي' });
await api(`/api/leaves/${lv2.id}`, 'PATCH', { action: 'approve' });
log('إجازات معتمدة: مدفوعة(102 يوم 2) + غير مدفوعة(103 يوم 2)');

// ===== 6) سجلات بصمة — اليوم 2 غياب لـ 104 و106، ودوام كامل لـ 101 و102(إجازة) =====
// اليوم 1 = عطلة رسمية، اليوم 2 = يوم عمل
const punches = [];
const punch = (code, dt, status) => punches.push({ pin: code, punchTime: dt, status });
// 101: حاضر يوم 2 مع تأخير 10 دقائق وإضافي 30 دقيقة
punch('101', '2026-11-02T08:10:00+03:00', 0);
punch('101', '2026-11-02T17:30:00+03:00', 1);
// 105: حاضر يوم 2 بلا تأخير
punch('105', '2026-11-02T07:55:00+03:00', 0);
punch('105', '2026-11-02T17:00:00+03:00', 1);
// 103: بصمة دخول فقط يوم 2 (بصمة ناقصة) — لكنه في إجازة غير مدفوعة؟ الإجازة تحمي اليوم → lu
// 104: لا بصمة إطلاقًا → غياب يوم 2
// 106: لا بصمة → غياب (مُعيّن حديثًا)
for (const p of punches) {
  await api('/api/attendance-logs', 'POST', { pin: p.pin, sn: 'TEST-SN-0001', punchTime: p.punchTime, status: p.status });
}
log('سجلات بصمة:', punches.length);

// ===== 7) إعادة معالجة الحضور اليومي =====
const rec = await api('/api/attendance/recompute', 'POST', { fromDate: '2026-11-01', toDate: '2026-11-02' });
log('إعادة معالجة الحضور:', JSON.stringify(rec).slice(0, 120));

// ===== 8) جوازات وإقامات وسيارات وعقود شركة بتواريخ نفاذ =====
await api('/api/passports', 'POST', { holderName: 'محمد سيد مصطفى', passportNo: 'A1234567', nationality: 'مصري', employeeId: empIds['102'], issueDate: '2020-11-15', expiryDate: '2026-11-12', notes: 'قريب النفاذ' });
await api('/api/passports', 'POST', { holderName: 'راجيش كومار', passportNo: 'P9988776', nationality: 'هندي', employeeId: empIds['103'], issueDate: '2019-10-01', expiryDate: '2026-10-20', notes: 'منتهي' });
await api('/api/passports', 'POST', { holderName: 'أحمد عبدالله', passportNo: 'KW555123', nationality: 'كويتي', employeeId: empIds['101'], issueDate: '2023-01-01', expiryDate: '2028-01-01' });

await api('/api/iqamas', 'POST', { holderName: 'محمد سيد مصطفى', iqamaNo: '289112000123', nationality: 'مصري', profession: 'محاسب', sponsor: 'شركة ADMS', employeeId: empIds['102'], issueDate: '2024-12-06', expiryDate: '2026-11-27' });
await api('/api/iqamas', 'POST', { holderName: 'راجيش كومار', iqamaNo: '289112000456', nationality: 'هندي', profession: 'فني', sponsor: 'شركة ADMS', employeeId: empIds['103'], issueDate: '2025-01-15', expiryDate: '2027-01-14' });

await api('/api/vehicles', 'POST', { plateNo: 'ABC 123', make: 'Toyota', model: 'Hilux', year: 2022, color: 'أبيض', driverName: 'سيف الدين حسن', licenseExpiry: '2026-11-22', insuranceExpiry: '2027-01-10', insuranceCompany: 'شركة التأمين الوطنية', policyNo: 'POL-8899' });
await api('/api/vehicles', 'POST', { plateNo: 'XYZ 789', make: 'Nissan', model: 'Patrol', year: 2023, color: 'أسود', driverName: 'أحمد عبدالله', licenseExpiry: '2027-03-15', insuranceExpiry: '2027-01-22', inspectionExpiry: '2026-12-15' });

await api('/api/company-contracts', 'POST', { name: 'عقد نظافة ومحافظ', counterparty: 'شركة النقاء', contractNo: 'CC-001', type: 'خدمات', value: 1200, startDate: '2026-01-01', endDate: '2026-12-17', renewal: true });
await api('/api/company-contracts', 'POST', { name: 'إيجار المستودع', counterparty: 'الوكيل العقاري', contractNo: 'CC-002', type: 'إيجار', value: 600, startDate: '2025-11-01', endDate: '2026-11-15', renewal: true });

log('جوازات 3 + إقامات 2 + سيارات 2 + عقود شركة 2');

console.log('\n✅ اكتملت التعبئة');
