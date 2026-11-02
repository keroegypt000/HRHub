// اختبار إعادة إنتاج مشاكل المستخدم على Postgres حقيقي
const BASE = 'http://localhost:3100';
let TOKEN = null;

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  const results = [];
  const t = (name, r, expectOk = true) => {
    const pass = expectOk ? r.status < 400 : r.status >= 400;
    results.push({ name, status: r.status, pass, error: r.data?.error || null });
    console.log(`${pass ? '✅' : '❌'} ${name} → ${r.status}${r.data?.error ? ' | ' + r.data.error : ''}`);
    return r;
  };

  // 1) الإعداد الأول + دخول
  await api('/api/setup', 'POST', { username: 'admin', password: 'Admin@12345', name: 'مدير', companyName: 'شركة الاختبار' });
  const login = await api('/api/auth/login', 'POST', { username: 'admin', password: 'Admin@12345' });
  TOKEN = login.data?.token || login.data?.user?.token;
  console.log('token:', TOKEN ? 'OK' : 'FAILED', JSON.stringify(login.data).slice(0, 120));

  // 2) صفحة العقود (المشكلة رقم 1): GET /api/contracts
  const contracts = t('GET /api/contracts (صفحة العقود)', await api('/api/contracts'));
  console.log('   rows:', contracts.data?.rows?.length, 'total:', contracts.data?.total);

  // 3) إنشاء قسم
  const dep = t('POST /api/departments', await api('/api/departments', 'POST', { name: 'قسم الاختبار' }));
  const depId = dep.data?.id;
  console.log('   departmentId:', depId);

  // 4) إنشاء موظف
  const emp = t('POST /api/employees', await api('/api/employees', 'POST', {
    code: 'T001', name: 'موظف اختبار', status: 'active', basicSalary: 500, hireDate: '2020-01-15',
  }));
  const empId = emp.data?.id;
  console.log('   employeeId:', empId);

  // 5) المشكلة رقم 2: إسناد قسم للموظف (نفس ما يرسله الـCrudPanel)
  const putPayload = {
    code: 'T001', name: 'موظف اختبار', gender: null, nationality: null, civilId: null,
    passportNo: null, phone: null, email: null,
    departmentId: depId, positionId: null,
    hireDate: '2020-01-15', birthDate: null, maritalStatus: null,
    basicSalary: 500, bankAccount: null, status: 'active', pin: 'T001',
    address: null, notes: null,
  };
  const putEmp = t('PUT /api/employees/{id} (إسناد قسم)', await api(`/api/employees/${empId}`, 'PUT', putPayload));
  if (putEmp.status >= 400) console.log('   full response:', JSON.stringify(putEmp.data).slice(0, 600));

  // 6) إنشاء عقد
  const contract = t('POST /api/contracts (عقد جديد)', await api('/api/contracts', 'POST', {
    employeeId: empId, type: 'full_time', startDate: '2020-01-15',
    basicSalary: 500, housingAllowance: 100, transportAllowance: 50, hoursPerDay: 8, daysPerWeek: 5,
  }));

  // 7) تعديل عقد
  if (contract.data?.id) {
    t(`PUT /api/contracts/{id}`, await api(`/api/contracts/${contract.data.id}`, 'PUT', {
      employeeId: empId, type: 'full_time', startDate: '2020-01-15', endDate: '2026-12-31',
      basicSalary: 550, hoursPerDay: 8, daysPerWeek: 5,
    }));
  }

  // 8) فحص بقية الأقسام كلها GET
  const sections = ['departments', 'positions', 'employees', 'shifts', 'leave-types', 'holidays',
    'devices', 'salary-components', 'payroll-periods', 'payslips', 'leaves', 'contracts', 'settings'];
  for (const s of sections) {
    const r = await api(`/api/${s}`);
    const pass = r.status < 400;
    console.log(`${pass ? '✅' : '❌'} GET /api/${s} → ${r.status}${r.data?.error ? ' | ' + r.data.error : ''}`);
    if (!pass) results.push({ name: `GET ${s}`, status: r.status, pass: false, error: r.data?.error });
  }

  const failed = results.filter((x) => !x.pass);
  console.log(`\n===== النتيجة: ${results.length - failed.length}/${results.length} نجح =====`);
  if (failed.length) { console.log('الفاشل:'); failed.forEach((f) => console.log(' -', f.name, f.status, f.error)); }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
