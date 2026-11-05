// بيانات تجريبية كاملة لعرض HRHub كنظام شركة حقيقي — كل الأسماء والأرقام وهمية
// الاستخدام:
//   node scripts/load-demo.mjs https://hrhub-xxxx.onrender.com          ← تحميل
//   node scripts/load-demo.mjs https://hrhub-xxxx.onrender.com --remove ← مسح كل البيانات التجريبية
// العلامات: أكواد الموظفين D001..D040، ملاحظات [DEMO]، أسماء فيها (تجريبي)، مستخدمون demo.*
import readline from 'node:readline';

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
const REMOVE = process.argv.includes('--remove');
if (!/^https?:\/\//.test(BASE)) {
  console.log('اكتب رابط الموقع: node scripts/load-demo.mjs https://hrhub-xxxx.onrender.com [--remove]');
  process.exit(1);
}

// ===== إدخال اسم المستخدم وكلمة السر (قارئ واحد، كلمة السر نجوم) =====
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let hideInput = false;
const writeOut = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (s) => { if (hideInput && !s.includes(':')) rl.output.write('*'); else writeOut?.(s); };
const lines = []; const waiters = [];
rl.on('line', (l) => { if (waiters.length) waiters.shift()(l); else lines.push(l); });
function ask(q, hidden = false) {
  process.stdout.write(q); hideInput = hidden;
  const done = (a) => { if (hidden) process.stdout.write('\n'); hideInput = false; return a.trim(); };
  if (lines.length) return Promise.resolve(done(lines.shift()));
  return new Promise((res) => waiters.push((l) => res(done(l))));
}

// ===== API =====
let TOKEN = null;
async function api(path, method = 'GET', body, form) {
  const headers = {};
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${data.error || text.slice(0, 200)}`);
  return data;
}
const rows = (d) => d.rows || d.data || [];
const step = (m) => console.log(`\n▶ ${m}`);
const tryApi = async (...a) => { try { return await api(...a); } catch (e) { console.log(`  ! ${e.message}`); return null; } };

// ===== مولد أرقام ثابت (نفس البيانات في كل تشغيل) =====
let seed = 20261103;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
const pad = (n) => String(n).padStart(2, '0');
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const addYears = (d, y) => `${Number(d.slice(0, 4)) + y}${d.slice(4)}`;

const DEMO = '[DEMO]';
const TAG = '(تجريبي)';

// ===== الوحدات والموظفون (أسماء وهمية) =====
// [الاسم، الجنسية، الجنس، المسمى، الراتب]
const UNITS = {
  Showroom: {
    off: '[0]', shift: 'صباحي', people: [
      ['Rajesh Kumar Nair', 'Indian', 'ذكر', 'Showroom Manager', 850],
      ['Suresh Babu Menon', 'Indian', 'ذكر', 'Cashier', 220], ['Maria Lopez Cruz', 'Filipino', 'أنثى', 'Cashier', 240],
      ['Nimal Perera', 'Sri Lankan', 'ذكر', 'Cashier', 210], ['Ahmed Mostafa Ali', 'Egyptian', 'ذكر', 'Sales Executive', 380],
      ['Jose Santos Reyes', 'Filipino', 'ذكر', 'Sales Executive', 350], ['Deepak Sharma', 'Indian', 'ذكر', 'Sales Executive', 330],
      ['Ana Marie Dizon', 'Filipino', 'أنثى', 'Sales Executive', 360], ['Karim Adel Fathy', 'Egyptian', 'ذكر', 'Sales Executive', 400],
      ['Vijay Pillai', 'Indian', 'ذكر', 'Sales Executive', 320], ['Kasun Silva', 'Sri Lankan', 'ذكر', 'Storekeeper', 260],
      ['Abdul Karim Mia', 'Bangladeshi', 'ذكر', 'Storekeeper', 240], ['Ram Bahadur Gurung', 'Nepali', 'ذكر', 'Labor', 130],
      ['Rafiqul Islam', 'Bangladeshi', 'ذكر', 'Labor', 125],
    ],
  },
  Wafra: {
    off: '[5]', shift: 'ميداني', people: [
      ['Mahmoud Hassan Saad', 'Egyptian', 'ذكر', 'Supervisor', 550], ['Bishnu Thapa', 'Nepali', 'ذكر', 'Labor', 120],
      ['Hari Tamang', 'Nepali', 'ذكر', 'Labor', 120], ['Jamal Uddin', 'Bangladeshi', 'ذكر', 'Labor', 115],
      ['Mohammed Hossain', 'Bangladeshi', 'ذكر', 'Labor', 115], ['Chaminda Jayasena', 'Sri Lankan', 'ذكر', 'Labor', 125],
      ['Asif Mehmood', 'Pakistani', 'ذكر', 'Driver', 230], ['Bilal Ahmed Qureshi', 'Pakistani', 'ذكر', 'Driver', 220],
    ],
  },
  Landscaping: {
    off: '[5]', shift: 'ميداني', people: [
      ['Mohamed Saeed Ibrahim', 'Egyptian', 'ذكر', 'Supervisor', 600], ['Krishna Rai', 'Nepali', 'ذكر', 'Gardener', 160],
      ['Ruwan Fernando', 'Sri Lankan', 'ذكر', 'Gardener', 170], ['Manoj Thomas', 'Indian', 'ذكر', 'Gardener', 165],
      ['Sanjay Patel', 'Indian', 'ذكر', 'Gardener', 160], ['Arun Das', 'Indian', 'ذكر', 'Gardener', 155],
      ['Anwar Hossain', 'Bangladeshi', 'ذكر', 'Gardener', 150], ['Dil Kumar Magar', 'Nepali', 'ذكر', 'Gardener', 150],
      ['Pradeep Joseph', 'Indian', 'ذكر', 'Gardener', 160], ['Tamer Fathy Nour', 'Egyptian', 'ذكر', 'Driver', 260],
      ['Mark Anthony Reyes', 'Filipino', 'ذكر', 'Driver', 250], ['Shahid Latif', 'Pakistani', 'ذكر', 'Labor', 130],
    ],
  },
  HOD: {
    off: '[5,6]', shift: 'مكتب', people: [
      ['Fahad Al-Mutairi', 'Kuwaiti', 'ذكر', 'General Manager', 2200], ['Noura Al-Enezi', 'Kuwaiti', 'أنثى', 'HR Officer', 1100],
      ['Sameh Abdelaziz', 'Egyptian', 'ذكر', 'Accountant', 750], ['Grace Villanueva', 'Filipino', 'أنثى', 'HR Officer', 450],
      ['Ramesh Iyer', 'Indian', 'ذكر', 'Accountant', 600], ['Dalia Youssef', 'Egyptian', 'أنثى', 'Admin Assistant', 420],
    ],
  },
};

const SHIFTS = {
  صباحي: { name: `Showroom صباحي 08:00-17:00 ${TAG}`, startTime: '08:00', endTime: '17:00', workDays: '[1,2,3,4,5,6]' },
  مسائي: { name: `Showroom مسائي 13:00-22:00 ${TAG}`, startTime: '13:00', endTime: '22:00', workDays: '[1,2,3,4,5,6]' },
  ميداني: { name: `ميداني 06:00-14:00 ${TAG}`, startTime: '06:00', endTime: '14:00', workDays: '[0,1,2,3,4,6]' },
  مكتب: { name: `مكتب 08:00-16:00 ${TAG}`, startTime: '08:00', endTime: '16:00', workDays: '[0,1,2,3,4]' },
};
const AREAS = ['Al Rai', 'Farwaniya', 'Salmiya', 'Jleeb Al-Shuyoukh', 'Fahaheel', 'Hawally', 'Mahboula', 'Wafra', 'Khaitan', 'Abu Halifa'];
const REQ_TYPES = ['vacation', 'loan', 'salary_certificate', 'salary_continuity', 'uniform', 'it_device', 'stationary', 'business_card', 'equipment'];
const DEVICE_SN = 'DEMO-DEVICE-01';

async function login() {
  const health = await api('/api/health?quick=1');
  if (!health.connected) throw new Error('قاعدة البيانات غير متصلة — راجع DATABASE_URL');
  const username = await ask('اسم مستخدم المدير: ');
  const password = await ask('كلمة السر: ', true);
  TOKEN = (await api('/api/auth/login', 'POST', { username, password })).token;
  rl.close();
  console.log('  ✓ تم الدخول');
}

// ======================= المسح =======================
async function removeDemo() {
  step('مسح البيانات التجريبية');
  const periods = rows(await api('/api/payroll-periods')).filter((p) => String(p.notes || '').includes(DEMO));
  for (const p of periods) {
    if (p.status !== 'draft') await tryApi(`/api/payroll-periods/${p.id}/reopen`, 'POST');
    if (await tryApi(`/api/payroll-periods/${p.id}`, 'DELETE')) console.log(`  − فترة رواتب ${p.name}`);
  }
  const emps = rows(await api('/api/employees')).filter((e) => /^D0\d\d$/.test(e.code));
  for (const e of emps) await tryApi(`/api/employees/${e.id}`, 'DELETE');
  console.log(`  − ${emps.length} موظف (ومعهم العقود والإجازات والطلبات والسلف والقسائم والتسويات)`);
  for (const [path, test, label] of [
    ['/api/passports', (r) => String(r.notes || '').includes(DEMO), 'جواز'],
    ['/api/iqamas', (r) => String(r.notes || '').includes(DEMO), 'إقامة'],
    ['/api/vehicles', (r) => String(r.notes || '').includes(DEMO), 'سيارة'],
    ['/api/company-contracts', (r) => String(r.notes || '').includes(DEMO), 'عقد شركة'],
    ['/api/holidays', (r) => String(r.name || '').includes(TAG), 'عطلة'],
    ['/api/devices', (r) => r.sn === DEVICE_SN, 'جهاز'],
    ['/api/shifts', (r) => String(r.name || '').includes(TAG), 'وردية'],
  ]) {
    const list = rows(await api(path)).filter(test);
    for (const r of list) await tryApi(`${path}/${r.id}`, 'DELETE');
    console.log(`  − ${list.length} ${label}`);
  }
  // سلاسل الموافقات التي ضبطها العرض → ترجع للافتراضي (الموارد البشرية)
  for (const unit of Object.keys(UNITS)) {
    for (const t of REQ_TYPES) {
      await tryApi('/api/workflow', 'PUT', { unitKey: unit, requestType: t, level1UserId: null, level2UserId: null, level3UserId: null, level4UserId: null, notifyEmail: null });
    }
  }
  console.log('  − سلاسل الموافقات التجريبية');
  const users = rows(await api('/api/users')).filter((u) => u.username.startsWith('demo.') || /^D0\d\d$/.test(u.username));
  for (const u of users) await tryApi(`/api/users/${u.id}`, 'DELETE');
  console.log(`  − ${users.length} مستخدم تجريبي`);
  console.log('\nتم المسح ✅ — الأقسام والمسميات بقيت كما هي لاستخدامها مع البيانات الحقيقية.');
}

// ======================= التحميل =======================
async function loadDemo() {
  const existing = rows(await api('/api/employees')).filter((e) => /^D0\d\d$/.test(e.code));
  if (existing.length) {
    console.log(`\nالبيانات التجريبية موجودة بالفعل (${existing.length} موظف). للتحميل من جديد: شغّل بـ --remove أولًا.`);
    return;
  }

  step('الأقسام والمسميات والورديات');
  const depts = rows(await api('/api/departments'));
  const deptId = {};
  for (const name of Object.keys(UNITS)) {
    deptId[name] = (depts.find((d) => d.name === name) || await api('/api/departments', 'POST', { name, notes: 'وحدة' })).id;
  }
  const positions = rows(await api('/api/positions'));
  const posId = {};
  for (const name of new Set(Object.values(UNITS).flatMap((u) => u.people.map((p) => p[3])))) {
    posId[name] = (positions.find((p) => p.name === name) || await api('/api/positions', 'POST', { name })).id;
  }
  const shiftId = {};
  for (const [k, s] of Object.entries(SHIFTS)) {
    shiftId[k] = (await api('/api/shifts', 'POST', {
      ...s, type: 'fixed', graceMinutes: 10, earlyGraceMinutes: 10, otEnabled: true, otRoundMinutes: 15, halfDayMinutes: 240, active: true,
    })).id;
  }
  console.log(`  ✓ ${Object.keys(deptId).length} وحدات · ${Object.keys(posId).length} مسمى · ${Object.keys(shiftId).length} ورديات`);

  step('الموظفون (40) بكل الحقول + العقود');
  const emps = [];
  let n = 0;
  for (const [unit, def] of Object.entries(UNITS)) {
    for (const [name, nationality, gender, position, basic] of def.people) {
      n++;
      const code = `D${String(n).padStart(3, '0')}`;
      const isKuwaiti = nationality === 'Kuwaiti';
      const lead = /Manager|Supervisor/.test(position);
      const hireDate = `${int(2015, 2025)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
      const employee = await api('/api/employees', 'POST', {
        code, name, gender, nationality,
        civilId: `9${digits(11)}`, passportNo: isKuwaiti ? null : `DM${digits(7)}`,
        phone: `+965 9${digits(7)}`, email: `${code.toLowerCase()}@demo.invalid`,
        address: `${pick(AREAS)}، الكويت`, birthDate: `${int(1970, 2000)}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
        maritalStatus: pick(['أعزب/عزباء', 'متزوج/متزوجة', 'متزوج/متزوجة']),
        departmentId: deptId[unit], positionId: posId[position], hireDate, basicSalary: basic,
        bankAccount: `KW00DEMO${digits(14)}`, status: 'active', weeklyOffDays: def.off,
        eosBasis: unit === 'HOD' ? 'full_wage' : null, notes: `${DEMO} بيانات تجريبية`,
        otEligible: unit !== 'HOD' && !lead, attendanceExempt: position === 'General Manager',
      });
      const housing = unit === 'HOD' || lead ? int(5, 15) * 10 : 0;
      const transport = unit === 'HOD' || lead ? int(2, 5) * 10 : 0;
      const contractEnd = rnd() < 0.15 ? `2026-${pad(int(11, 12))}-${pad(int(1, 28))}` : null;
      await api('/api/contracts', 'POST', {
        employeeId: employee.id, type: 'full_time', startDate: hireDate, endDate: contractEnd, basicSalary: basic,
        housingAllowance: housing, transportAllowance: transport, otherAllowance: 0, hoursPerDay: 8,
        daysPerWeek: def.off === '[5,6]' ? 5 : 6, status: 'active', notes: DEMO,
      });
      const shiftKey = unit === 'Showroom' && n % 2 === 0 ? 'مسائي' : def.shift;
      emps.push({ ...employee, unit, position, basic, shiftKey, lead, isKuwaiti });
    }
  }
  // المدير المباشر = مشرف/مدير الوحدة، ومدير الوحدات = المدير العام
  const gm = emps.find((e) => e.position === 'General Manager');
  for (const unit of Object.keys(UNITS)) {
    const head = emps.find((e) => e.unit === unit && e.lead) || gm;
    for (const e of emps.filter((x) => x.unit === unit)) {
      const managerId = e.id === head.id ? (e.id === gm.id ? null : gm.id) : head.id;
      if (managerId) await api(`/api/employees/${e.id}`, 'PUT', { code: e.code, name: e.name, managerId });
    }
  }
  for (const k of Object.keys(SHIFTS)) {
    const ids = emps.filter((e) => e.shiftKey === k).map((e) => e.id);
    if (ids.length) await api('/api/shift-assignments', 'POST', { employeeIds: ids, shiftId: shiftId[k], fromDate: '2026-10-01' });
  }
  console.log(`  ✓ ${emps.length} موظف بعقودهم ومديريهم ووردياتهم`);

  step('الجوازات والإقامات (بعضها قارب على الانتهاء للتنبيهات)');
  let docs = 0;
  for (const e of emps.filter((x) => !x.isKuwaiti)) {
    const soon = rnd() < 0.2;
    const pExpiry = soon ? `2026-${pad(int(11, 12))}-${pad(int(1, 28))}` : `${int(2027, 2033)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
    await api('/api/passports', 'POST', { employeeId: e.id, holderName: e.name, passportNo: e.passportNo, nationality: e.nationality, issueDate: addYears(pExpiry, -10), expiryDate: pExpiry, notes: DEMO });
    const r = rnd();
    const iExpiry = r < 0.1 ? `2026-${pad(int(8, 10))}-${pad(int(1, 28))}` : r < 0.3 ? `2026-${pad(int(11, 12))}-${pad(int(1, 28))}` : `2027-${pad(int(1, 12))}-${pad(int(1, 28))}`;
    await api('/api/iqamas', 'POST', { employeeId: e.id, holderName: e.name, iqamaNo: `9${digits(11)}`, nationality: e.nationality, profession: e.position, issueDate: addYears(iExpiry, -1), expiryDate: iExpiry, sponsor: 'Al Fares Garden', notes: DEMO });
    docs += 2;
  }
  console.log(`  ✓ ${docs} مستند`);

  step('السيارات وعقود الشركة والعطلات');
  const drivers = emps.filter((e) => e.position === 'Driver');
  for (let i = 0; i < 5; i++) {
    await api('/api/vehicles', 'POST', {
      plateNo: `DEMO-${10 + i}/${digits(5)}`, make: pick(['Toyota', 'Nissan', 'Mitsubishi', 'Isuzu']), model: pick(['Hilux', 'Navara', 'Canter', 'L200', 'D-Max']),
      year: int(2016, 2024), color: pick(['أبيض', 'فضي', 'أزرق']), driverName: drivers[i % drivers.length]?.name || null,
      licenseExpiry: `2026-${pad(int(11, 12))}-${pad(int(1, 28))}`, insuranceExpiry: `2027-${pad(int(1, 6))}-${pad(int(1, 28))}`,
      inspectionExpiry: `2026-${pad(int(11, 12))}-${pad(int(1, 28))}`, insuranceCompany: 'شركة تأمين (تجريبية)', policyNo: `POL-${digits(6)}`, notes: DEMO,
    });
  }
  for (const [name, counterparty, type, value, end] of [
    ['إيجار معرض الري', 'مالك العقار (تجريبي)', 'إيجار', 18000, '2027-03-31'],
    ['صيانة أنظمة الري', 'شركة صيانة (تجريبية)', 'صيانة', 4200, '2026-12-15'],
    ['تأمين صحي للموظفين', 'شركة تأمين (تجريبية)', 'خدمات', 9600, '2026-11-30'],
    ['توريد شتلات ونباتات', 'مورد (تجريبي)', 'توريد', 25000, '2027-06-30'],
  ]) {
    await api('/api/company-contracts', 'POST', { name, counterparty, type, value, startDate: addYears(end, -1), endDate: end, renewal: true, status: 'active', contractNo: `CC-${digits(5)}`, notes: DEMO });
  }
  for (const [name, date, endDate] of [
    ['رأس السنة الميلادية', '2026-01-01', null], ['العيد الوطني وعيد التحرير', '2026-02-25', '2026-02-26'],
    ['عيد الفطر', '2026-03-20', '2026-03-22'], ['وقفة عرفات وعيد الأضحى', '2026-05-26', '2026-05-29'],
    ['رأس السنة الهجرية', '2026-06-16', null], ['المولد النبوي', '2026-08-25', null],
  ]) {
    await api('/api/holidays', 'POST', { name: `${name} ${TAG}`, date, endDate });
  }
  console.log('  ✓ 5 سيارات · 4 عقود شركة · 6 عطلات رسمية (تواريخ تقريبية)');

  step('مستخدمو الموافقات وسلاسل الموافقات (4 وحدات × 9 أنواع)');
  const approvers = {};
  const creds = [];
  for (const [unit, role] of [['Showroom', 'supervisor'], ['Wafra', 'supervisor'], ['Landscaping', 'supervisor'], ['HOD', 'hr']]) {
    const head = emps.find((e) => e.unit === unit && (e.lead || e.position === 'HR Officer'));
    const username = `demo.${unit.toLowerCase()}`;
    const password = `Demo-${digits(4)}-${unit.slice(0, 3)}`;
    const u = await api('/api/users', 'POST', { username, name: `${head.name} (${unit})`, password, role, email: `${username}@demo.invalid` });
    approvers[unit] = u.id;
    creds.push([username, password, unit]);
  }
  for (const unit of Object.keys(UNITS)) {
    for (const t of REQ_TYPES) {
      await api('/api/workflow', 'PUT', {
        unitKey: unit, requestType: t,
        level1UserId: approvers[unit], level2UserId: unit === 'HOD' ? null : approvers.HOD,
        level3UserId: null, level4UserId: null, notifyEmail: `hr@demo.invalid`,
      });
    }
  }
  console.log(`  ✓ ${creds.length} معتمدين · ${Object.keys(UNITS).length * REQ_TYPES.length} سلسلة`);

  step('الإجازات (معتمدة وقيد الانتظار)');
  const types = rows(await api('/api/leave-types'));
  const annual = types.find((t) => /annual/i.test(t.code)); const sick = types.find((t) => /sick/i.test(t.code));
  const leaveDays = new Map(); // code → Set(dates) لتخطي البصمات
  const plans = [];
  for (let i = 0; i < 9; i++) { const d = int(1, 20); plans.push([emps[int(1, emps.length - 1)], annual, `2026-10-${pad(d)}`, `2026-10-${pad(Math.min(31, d + int(4, 10)))}`, true]); }
  for (let i = 0; i < 5; i++) { const d = int(1, 28); plans.push([emps[int(1, emps.length - 1)], sick, `2026-10-${pad(d)}`, `2026-10-${pad(d + int(0, 2))}`, true]); }
  for (let i = 0; i < 4; i++) { const d = int(1, 20); plans.push([emps[int(1, emps.length - 1)], annual, `2026-12-${pad(d)}`, `2026-12-${pad(d + 7)}`, false]); }
  let lv = 0;
  for (const [e, type, from, to, approve] of plans) {
    const created = await tryApi('/api/leaves', 'POST', { employeeId: e.id, leaveTypeId: type.id, fromDate: from, toDate: to, reason: `${DEMO} ${type.name}` });
    if (!created) continue; // تداخل — يُتخطى
    lv++;
    if (approve) {
      await api(`/api/leaves/${created.id}`, 'PATCH', { action: 'approve' });
      const set = leaveDays.get(e.code) || new Set();
      for (let d = Number(from.slice(8)); d <= Number(to.slice(8)); d++) set.add(`${from.slice(0, 8)}${pad(d)}`);
      leaveDays.set(e.code, set);
    }
  }
  console.log(`  ✓ ${lv} إجازة`);

  step('البصمات — أكتوبر 2026 لكل الموظفين (استيراد ملف جهاز)');
  await tryApi('/api/devices', 'POST', { sn: DEVICE_SN, name: `جهاز المعرض ${TAG}`, model: 'SpeedFace', location: 'Al Rai', mode: 'push', enabled: false });
  const holidays = new Set();
  let punches = 0;
  for (const week of [[1, 8], [9, 16], [17, 24], [25, 31]]) {
    const out = [];
    for (const e of emps) {
      const s = SHIFTS[e.shiftKey];
      const workDays = JSON.parse(UNITS[e.unit].off).length ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !JSON.parse(UNITS[e.unit].off).includes(d)) : [0, 1, 2, 3, 4, 5, 6];
      const [sh, sm] = s.startTime.split(':').map(Number); const [eh, em] = s.endTime.split(':').map(Number);
      for (let d = week[0]; d <= week[1]; d++) {
        const date = `2026-10-${pad(d)}`;
        if (!workDays.includes(new Date(`${date}T12:00:00+03:00`).getUTCDay()) || holidays.has(date)) continue;
        if (leaveDays.get(e.code)?.has(date)) continue;
        const roll = rnd();
        if (roll < 0.04) continue; // غياب
        const inMin = sh * 60 + sm + (rnd() < 0.15 ? int(12, 45) : int(-20, 8));
        const outMin = eh * 60 + em + (rnd() < 0.3 ? int(15, 120) : int(-5, 10));
        const add = (min, st) => { out.push(`${e.code}\t${date} ${hm(min)}:${pad(int(0, 59))}\t${st}\t${pick([1, 15])}`); punches++; };
        add(inMin, 0);
        if (roll > 0.97) continue; // بصمة خروج ناقصة
        if ((e.unit === 'HOD' || e.unit === 'Showroom') && rnd() < 0.6) {
          const b = 12 * 60 + 30 + int(0, 60); add(b, 2); add(b + int(30, 60), 3);
        }
        add(outMin, 1);
      }
    }
    const form = new FormData();
    form.append('file', new Blob([out.join('\n')], { type: 'text/plain' }), `demo_attlog_${week[0]}.dat`);
    form.append('sn', DEVICE_SN);
    await api('/api/import/usb', 'POST', null, form);
    process.stdout.write(`  … ${week[0]}-${week[1]} أكتوبر\n`);
  }
  console.log(`  ✓ ${punches} بصمة ومعالجة الحضور اليومي`);

  step('السلف');
  for (let i = 0; i < 6; i++) {
    const e = emps[int(1, emps.length - 1)]; const total = int(1, 6) * 100; const count = pick([3, 4, 6, 10, 12]);
    await tryApi('/api/loans', 'POST', { employeeId: e.id, name: `سلفة ${pick(['شخصية', 'سفر', 'علاج', 'دراسة أبناء'])}`, totalAmount: total, installmentsCount: count, monthlyDeduction: Math.round((total / count) * 1000) / 1000, startDate: '2026-10-01', notes: DEMO });
  }
  console.log('  ✓ 6 سلف تُخصم من الرواتب');

  step('العُهد (أجهزة وسيارات وأدوات وزي)');
  let cust = 0;
  for (const e of emps) {
    const items = [];
    if (e.unit === 'HOD' || e.lead) items.push(['لابتوب Dell Latitude', 'laptop', `SN-${digits(8)}`, 280]);
    if (e.unit !== 'Wafra' || e.lead) items.push(['هاتف + شريحة', 'phone', `IMEI-${digits(10)}`, 120]);
    if (e.position === 'Driver') items.push(['سيارة الشركة', 'vehicle', `DEMO-${digits(5)}`, 0]);
    if (['Gardener', 'Labor'].includes(e.position)) items.push(['عدة زراعة كاملة', 'tools', null, 45]);
    if (e.unit === 'Showroom') items.push(['زي موحد ×2', 'uniform', null, 18]);
    for (const [itemName, category, serialNo, value] of items) {
      const returned = rnd() < 0.1;
      await api('/api/custody', 'POST', {
        employeeId: e.id, itemName, category, serialNo, value, quantity: 1,
        issuedAt: `2026-${pad(int(1, 9))}-${pad(int(1, 28))}`, status: returned ? 'returned' : 'issued',
        returnedAt: returned ? '2026-10-20' : null, notes: DEMO,
      });
      cust++;
    }
  }
  console.log(`  ✓ ${cust} عهدة`);

  step('الحوافز والجزاءات (أكتوبر 2026)');
  const adjs = [
    ['earning', 'bonus', 'مكافأة أفضل بائع', 50, null], ['earning', 'commission', 'عمولة مبيعات', 75, null],
    ['earning', 'allowance', 'بدل هاتف', 10, '2026-12'], ['deduction', 'penalty', 'جزاء تأخير متكرر', 15, null],
    ['earning', 'incentive', 'حافز إنجاز مشروع', 100, null], ['deduction', 'deduction', 'خصم تلفيات', 25, null],
  ];
  for (const [type, category, name, amount, untilMonth] of adjs) {
    const e = emps[int(1, 13)];
    await api('/api/adjustments', 'POST', { employeeId: e.id, type, category, name, amount, month: '2026-10', untilMonth, notes: DEMO });
  }
  console.log(`  ✓ ${adjs.length} بند (تظهر في رواتب أكتوبر)`);

  step('الطلبات بسلاسل الموافقات (معلقة/معتمدة/مرفوضة/ملغاة)');
  const reqs = [
    ['salary_certificate', { purpose: 'بنك الكويت الوطني' }, 'approve'], ['salary_continuity', { purpose: 'سفارة' }, 'approve'],
    ['uniform', { description: 'زي موحد مقاس L ×2' }, 'step1'], ['it_device', { description: 'لابتوب للمبيعات' }, 'pending'],
    ['stationary', { description: 'أدوات مكتبية للمعرض' }, 'approve'], ['business_card', { description: '100 كارت' }, 'reject'],
    ['equipment', { description: 'ماكينة قص عشب' }, 'step1'], ['loan', { amount: 300, installments: 6 }, 'pending'],
    ['vacation', { leaveTypeId: annual.id, fromDate: '2026-12-25', toDate: '2026-12-31', description: 'سفر' }, 'pending'],
    ['uniform', { description: 'أحذية سلامة' }, 'cancel'], ['salary_certificate', { purpose: 'إلى من يهمه الأمر' }, 'pending'],
    ['it_device', { description: 'طابعة للحسابات' }, 'approve'],
  ];
  for (const [type, payload, action] of reqs) {
    const e = emps[int(1, emps.length - 1)];
    const r = await tryApi('/api/requests', 'POST', { employeeId: e.id, type, ...payload, notes: DEMO });
    if (!r) continue;
    if (action === 'approve') {
      let cur = r;
      for (let i = 0; i < 4 && cur?.status === 'pending'; i++) cur = await tryApi(`/api/requests/${r.id}`, 'POST', { action: 'approve', comment: 'موافق' });
    }
    if (action === 'step1') await tryApi(`/api/requests/${r.id}`, 'POST', { action: 'approve', comment: 'موافق مبدئيًا' });
    if (action === 'reject') await tryApi(`/api/requests/${r.id}`, 'POST', { action: 'reject', comment: 'غير مطلوب حاليًا' });
    if (action === 'cancel') await tryApi(`/api/requests/${r.id}`, 'POST', { action: 'cancel' });
  }
  console.log(`  ✓ ${reqs.length} طلب`);

  step('الرواتب — أكتوبر 2026 (حساب واعتماد)');
  let period = rows(await api('/api/payroll-periods')).find((p) => p.name === '2026-10');
  if (!period) period = await api('/api/payroll-periods', 'POST', { name: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31', notes: `${DEMO} فترة تجريبية` });
  if (period.status === 'draft' || period.status === 'computed') {
    const res = await api(`/api/payroll-periods/${period.id}/compute`, 'POST');
    await api(`/api/payroll-periods/${period.id}/approve`, 'POST');
    console.log(`  ✓ ${res.employees} قسيمة — صافي ${Number(res.totalNet).toFixed(3)} د.ك (معتمدة وتظهر في بوابة الموظف)`);
  } else console.log(`  ✓ الفترة ${period.status} من قبل — لم تُغيّر`);

  step('نهاية الخدمة (منصرفون)');
  for (const [e, reason, date] of [[emps[38], 'resigned', '2026-10-31'], [emps[39 - 26], 'terminated', '2026-10-20'], [emps[33], 'contract_end', '2026-10-15']]) {
    const s = await tryApi('/api/settlements', 'POST', { employeeId: e.id, departureDate: date, reason, notes: DEMO });
    if (s) console.log(`  ✓ ${e.code} ${e.name}: ${reason} — ${Number(s.totalDue).toFixed(3)} د.ك`);
  }

  step('حسابات بوابة الموظف (3 موظفين)');
  for (const e of [emps[1], emps[15], emps[35]]) {
    const acc = await tryApi(`/api/employees/${e.id}/account`, 'POST', {});
    if (acc) creds.push([acc.username, acc.password, `بوابة الموظف — ${e.name}`]);
  }

  console.log('\n══════════ انتهى ✅ ══════════');
  console.log('بيانات الدخول التجريبية (احتفظ بها — لن تظهر مرة أخرى):');
  for (const [u, p, note] of creds) console.log(`  ${u.padEnd(18)} ${p.padEnd(22)} ${note}`);
  console.log('\nملاحظات:');
  console.log('  • كل البيانات وهمية: أكواد D001..D040 وملاحظات [DEMO] — والبريد @demo.invalid لا يُرسل لأحد.');
  console.log('  • قبل إدخال البيانات الحقيقية امسحها بنفس الأمر مع --remove');
  console.log('  • مكونات الراتب الافتراضية (سكن 30% + مواصلات 30) تُضاف لكل موظف بلا بدلات في عقده — عطّلها إن لم تكن سياستكم.');
}

(async () => {
  console.log(`HRHub — ${REMOVE ? 'مسح' : 'تحميل'} البيانات التجريبية على ${BASE}`);
  await login();
  if (REMOVE) await removeDemo(); else await loadDemo();
})().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
