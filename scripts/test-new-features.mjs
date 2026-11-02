// اختبار شامل للتدفقات الجديدة: التنبيهات + نهاية الخدمة + المتوفون/المنصرفون
const BASE = 'http://localhost:3100';
let TOKEN = null;
let failures = 0;

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text.slice(0, 200) }; }
}

function check(name, r, expect = 200, extra = null) {
  const pass = r.status === expect;
  if (!pass) failures++;
  console.log(`${pass ? '✅' : '❌'} ${name} → ${r.status}${r.data?.error ? ' | ' + r.data.error : ''}`);
  if (!pass && extra) console.log('   ', JSON.stringify(r.data).slice(0, 300));
  return r.data;
}

async function main() {
  // دخول (قاعدة الاختبار فيها admin من الجولة السابقة)
  const login = await api('/api/auth/login', 'POST', { username: 'admin', password: 'Admin@12345' });
  TOKEN = login.data?.token;
  if (!TOKEN) { console.log('❌ فشل الدخول', JSON.stringify(login.data).slice(0, 200)); process.exit(1); }
  console.log('✅ دخول admin');

  // ===== الجوازات =====
  const pass1 = check('POST جواز', await api('/api/passports', 'POST', {
    holderName: 'أحمد تجريبي', passportNo: 'A1234567', nationality: 'مصري',
    issueDate: '2020-01-01', expiryDate: '2026-12-01',
  }), 201);
  check('POST جواز منتهي', await api('/api/passports', 'POST', {
    holderName: 'منتهي تجريبي', passportNo: 'B9999999', expiryDate: '2025-01-01',
  }), 201);
  check('GET الجوازات', await api('/api/passports'));
  if (pass1?.id) check('PUT جواز', await api(`/api/passports/${pass1.id}`, 'PUT', { expiryDate: '2027-06-01' }));

  // ===== السيارات =====
  const veh = check('POST مركبة', await api('/api/vehicles', 'POST', {
    plateNo: 'TEST-1', make: 'تويوتا', model: 'هايلوكس', year: 2022, driverName: 'سائق تجريبي',
    licenseExpiry: '2026-11-20', insuranceExpiry: '2026-11-10', inspectionExpiry: '2027-01-15',
    insuranceCompany: 'شركة التأمين', policyNo: 'POL-1',
  }), 201);
  check('GET المركبات', await api('/api/vehicles'));
  check('POST مركبة مكررة (يُرفض)', await api('/api/vehicles', 'POST', { plateNo: 'TEST-1' }), 400);

  // ===== عقود الشركة =====
  const cc = check('POST عقد شركة', await api('/api/company-contracts', 'POST', {
    name: 'عقد توريد مكاتب', counterparty: 'مؤسسة الأثاث', type: 'توريد', value: 1500,
    startDate: '2025-01-01', endDate: '2026-11-25', renewal: true,
  }), 201);
  check('GET عقود الشركة', await api('/api/company-contracts'));

  // ===== التنبيهات المجمعة =====
  const alerts = check('GET /api/alerts', await api('/api/alerts'));
  console.log(`   ملخص: منتهية=${alerts?.summary?.expired} d30=${alerts?.summary?.d30} d60=${alerts?.summary?.d60} d90=${alerts?.summary?.d90} إجمالي=${alerts?.total}`);
  if (!alerts?.summary || alerts.total < 1) { failures++; console.log('❌ لا توجد تنبيهات — المفروض الجواز المنتهي يظهر'); }
  else {
    const kinds = new Set(alerts.alerts.map((a) => a.kind));
    console.log('   أنواع الظاهرة:', [...kinds].join(', '));
  }

  // ===== نهاية الخدمة: موظف جديد + عقد + تسوية =====
  const emp = check('POST موظف للنهاية', await api('/api/employees', 'POST', {
    code: 'EOS1', name: 'موظف نهاية خدمة', status: 'active', basicSalary: 600, hireDate: '2018-03-01',
  }), 201);
  const contract = check('POST عقد الموظف', await api('/api/contracts', 'POST', {
    employeeId: emp.id, type: 'full_time', startDate: '2018-03-01',
    basicSalary: 600, housingAllowance: 150, transportAllowance: 50, hoursPerDay: 8, daysPerWeek: 5,
  }), 201);

  check('GET نهاية الخدمة (قائمة)', await api('/api/end-of-service'));
  const eosList = await api('/api/end-of-service');
  const row = eosList.data?.rows?.find((r) => r.code === 'EOS1');
  if (!row) { failures++; console.log('❌ الموظف EOS1 غير موجود في قائمة نهاية الخدمة'); }
  else console.log(`   EOS1: سنوات=${row.years} مستحق=${row.eosAccrued} لو استقال=${row.eosIfResigned}`);

  // إنهاء خدمات من الشركة بعد 8 سنوات → كاملة: 5*0.5+3*1 = 5.5 شهر × 800 = 4400
  const st = check('POST تسوية إنهاء خدمة', await api('/api/settlements', 'POST', {
    employeeId: emp.id, departureDate: '2026-11-03', reason: 'terminated',
    leaveAllowance: 200, otherDues: 100, deductions: 50,
  }), 201);
  if (st?.totalDue !== undefined) {
    console.log(`   التسوية: سنوات=${st.yearsServed} كاملة=${st.indemnityFull} معامل=${st.reasonFactor} مستحق=${st.eosAmount} إجمالي=${st.totalDue}`);
    const expectedWage = 600 + 150 + 50; // 800
    // القاعدة: أول 5 سنوات نصف شهر + ما بعدها شهر لكل سنة
    const expectedFull = Math.round(expectedWage * (Math.min(st.yearsServed, 5) * 0.5 + Math.max(st.yearsServed - 5, 0) * 1.0) * 1000) / 1000;
    if (Math.abs(st.indemnityFull - expectedFull) > 0.02) { failures++; console.log(`❌ حساب المكافأة: متوقع ${expectedFull} فعلي ${st.indemnityFull}`); }
    else console.log(`✅ حساب المكافأة صحيح (${expectedFull})`);
    if (st.totalDue !== st.eosAmount + 200 + 100 - 50) { failures++; console.log(`❌ الإجمالي: متوقع ${st.eosAmount + 250} فعلي ${st.totalDue}`); }
    else console.log('✅ الإجمالي = مستحق + 200 + 100 - 50 صحيح');
  }

  // دفعة جزئية
  const pay = check('PATCH دفعة 1000', await api(`/api/settlements/${st.id}`, 'PATCH', { amount: 1000, notes: 'تحويل بنكي' }), 200);
  if (pay?.status !== 'partial') { failures++; console.log('❌ الحالة المتوقعة partial وليست', pay?.status); }
  else console.log('✅ دفعة جزئية → الحالة partial');
  // دفعة تكميلية = المتبقي بالضبط
  const remaining = Math.round((st.totalDue - pay.paidAmount) * 1000) / 1000;
  const pay2 = check(`PATCH دفعة ${remaining} (تسديد كامل)`, await api(`/api/settlements/${st.id}`, 'PATCH', { amount: remaining }), 200);
  if (pay2?.status !== 'paid') { failures++; console.log('❌ الحالة المتوقعة paid وليست', pay2?.status); }
  else console.log('✅ سُددت بالكامل → الحالة paid');

  // موظف ينسحب للاستقالة بعد 4 سنوات → ثلث
  const emp2 = check('POST موظف استقالة', await api('/api/employees', 'POST', {
    code: 'EOS2', name: 'موظف استقالة', status: 'active', basicSalary: 900, hireDate: '2022-11-01',
  }), 201);
  const st2 = check('POST تسوية استقالة (4 سنوات → ثلث)', await api('/api/settlements', 'POST', {
    employeeId: emp2.id, departureDate: '2026-11-03', reason: 'resigned',
  }), 201);
  if (st2?.eosAmount !== undefined) {
    // الاستقالة بعد 4 سنوات: معامل الثلث على المكافأة المتراكمة (4.005 × 0.5 × 900 ≈ 1802 → ثلث ≈ 601)
    if (Math.abs(st2.reasonFactor - 1 / 3) > 0.001) { failures++; console.log(`❌ معامل الاستقالة: متوقع 1/3 فعلي ${st2.reasonFactor}`); }
    else if (Math.abs(st2.eosAmount - Math.round(st2.indemnityFull / 3 * 1000) / 1000) > 0.02) { failures++; console.log(`❌ مستحق الاستقالة ≠ ثلث المكافأة: ${st2.eosAmount} ≠ ${st2.indemnityFull / 3}`); }
    else console.log(`✅ حساب الاستقالة صحيح (${st2.eosAmount} = ثلث ${st2.indemnityFull})`);
  }

  // وفاة → كاملة للمستحقين
  const emp3 = check('POST موظف وفاة', await api('/api/employees', 'POST', {
    code: 'EOS3', name: 'موظف متوفى تجريبي', status: 'active', basicSalary: 500, hireDate: '2010-01-10',
  }), 201);
  const st3 = check('POST تسوية وفاة', await api('/api/settlements', 'POST', {
    employeeId: emp3.id, departureDate: '2026-11-03', reason: 'deceased',
  }), 201);
  if (st3?.eosAmount !== undefined) {
    // 16.9 سنوات: 5*0.5 + 11.9*1 ≈ 16.65 شهر × 500 ≈ 8325 كاملة (معامل 1)
    if (st3.reasonFactor !== 1) { failures++; console.log('❌ معامل الوفاة يجب أن يكون 1 وليس', st3.reasonFactor); }
    else console.log('✅ الوفاة: المكافأة كاملة (معامل 1)');
  }
  // حالة الموظف اتغيرت لـ deceased
  const emp3After = await api(`/api/employees/${emp3.id}`);
  if (emp3After.data?.status !== 'deceased') { failures++; console.log('❌ حالة الموظف المتوفى:', emp3After.data?.status); }
  else console.log('✅ حالة الموظف أصبحت deceased');

  // تعارض: تسوية ثانية لنفس الموظف
  check('POST تسوية مكررة (تُرفض)', await api('/api/settlements', 'POST', {
    employeeId: emp3.id, departureDate: '2026-11-03', reason: 'terminated',
  }), 400);

  // ===== قوائم المتوفين والمنصرفين (من ظهير التسويات) =====
  const stList = check('GET /api/settlements', await api('/api/settlements'));
  console.log(`   summary: عدد=${stList?.summary?.count} إجمالي=${stList?.summary?.totalDue} مدفوع=${stList?.summary?.paidAmount} متبقٍ=${stList?.summary?.remaining}`);

  // فلاتر الموظفين للصفحتين
  const deceased = await api('/api/employees?status=deceased');
  const departed = await api('/api/employees?status=terminated');
  console.log(`✅ موظفون deceased=${deceased.data?.rows?.length} terminated=${departed.data?.rows?.length}`);
  if (deceased.data?.rows?.length < 1) { failures++; console.log('❌ صفحة المتوفين فاضية'); }

  // حذف تسوية → يعود الموظف نشطًا
  check('DELETE تسوية (إرجاع نشط)', await api(`/api/settlements/${st2.id}`, 'DELETE'), 200);
  const emp2After = await api(`/api/employees/${emp2.id}`);
  if (emp2After.data?.status !== 'active') { failures++; console.log('❌ لم يعد نشطًا:', emp2After.data?.status); }
  else console.log('✅ حذف التسوية أعاد الموظف نشطًا');

  // ===== فحص الجداول (طلب المستخدم) =====
  const health = check('GET /api/health (فحص كل الجداول)', await api('/api/health'));
  const bad = Object.entries(health?.tables || {}).filter(([k, v]) => !String(v).startsWith('ok'));
  if (bad.length) { failures++; console.log('❌ جداول بمشاكل:', bad); }
  else console.log(`✅ كل ${Object.keys(health.tables).length} جدولًا سليم — status=${health.status}`);

  console.log(`\n${failures === 0 ? '🎉 كل الاختبارات نجحت' : `⚠ فشل ${failures} اختبار`}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
