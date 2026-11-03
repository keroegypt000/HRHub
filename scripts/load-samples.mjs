// تحميل بيانات العينات (Al Fares Garden) على أي نسخة من HRHub ومقارنة النتائج بتقارير MenaITech/BioTime
// الاستخدام:  node scripts/load-samples.mjs https://hrhub-xxxx.onrender.com
// يطلب اسم مستخدم وكلمة سر المدير — لا يحفظهما. آمن لإعادة التشغيل (لا يكرر البيانات).
import readline from 'node:readline';

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(BASE)) {
  console.log('اكتب رابط الموقع: node scripts/load-samples.mjs https://hrhub-xxxx.onrender.com');
  process.exit(1);
}

// قارئ واحد لكل الأسئلة — كلمة السر تظهر نجومًا
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let hideInput = false;
const writeOut = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (s) => { if (hideInput && !s.includes(':')) rl.output.write('*'); else writeOut?.(s); };
const lines = [];
const waiters = [];
rl.on('line', (l) => { if (waiters.length) waiters.shift()(l); else lines.push(l); });
function ask(question, hidden = false) {
  process.stdout.write(question);
  hideInput = hidden;
  const done = (a) => { if (hidden) process.stdout.write('\n'); hideInput = false; return a.trim(); };
  if (lines.length) return Promise.resolve(done(lines.shift()));
  return new Promise((res) => waiters.push((l) => res(done(l))));
}

let TOKEN = null;
async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${data.error || text.slice(0, 200)}`);
  return data;
}
const rows = (d) => d.rows || d.data || [];
const step = (msg) => console.log(`\n▶ ${msg}`);
const fmt = (n) => Number(n).toFixed(3);

async function findOrCreate(listPath, match, createPath, body, label) {
  const found = rows(await api(listPath)).find(match);
  if (found) { console.log(`  ✓ موجود: ${label}`); return found; }
  const created = await api(createPath, 'POST', body);
  console.log(`  + أُنشئ: ${label}`);
  return created;
}

// ===== البصمات من كشف BioTime: الموظف 37 Kiran — سبتمبر 2026 (أول بصمة / آخر بصمة) =====
const KIRAN_PUNCHES = [
  ['01', '07:45', '17:02', '08:58'], ['02', '07:55', '17:00', '08:32'], ['03', '07:51', '17:00', '09:09'],
  ['04', '07:49', '16:58', '08:52'], ['05', '07:56', '17:00', '08:44'], ['06', '16:21', null, '—'],
  ['07', '07:49', '16:56', '08:52'], ['08', '07:57', null, '05:23'], ['09', '07:59', '16:56', '08:41'],
  ['10', '08:18', '16:58', '08:25'], ['11', '07:51', '17:00', '09:08'], ['12', '07:54', '17:33', '09:15'],
  ['14', '07:52', null, '05:37'], ['15', '08:17', '17:11', '08:39'], ['16', '12:52', '21:57', '08:53'],
  ['17', '12:56', '21:57', '09:00'], ['18', '13:06', '22:02', '08:55'], ['19', '12:59', '22:00', '09:00'],
  ['21', '08:07', '17:07', '08:46'], ['22', '13:01', '22:01', '08:59'], ['23', '13:05', '22:01', '08:55'],
  ['24', '13:13', '22:00', '08:47'], ['25', '13:04', '22:00', '08:55'], ['26', '13:02', '22:00', '08:57'],
  ['28', '13:07', '22:00', '08:52'], ['29', '13:13', '22:00', '08:46'], ['30', '13:00', '22:00', '08:59'],
];

async function main() {
  console.log(`HRHub — تحميل بيانات العينات على ${BASE}`);
  const health = await api('/api/health?quick=1');
  if (!health.connected) throw new Error('قاعدة البيانات غير متصلة — راجع DATABASE_URL');

  const username = await ask('اسم مستخدم المدير: ');
  const password = await ask('كلمة السر: ', true);
  TOKEN = (await api('/api/auth/login', 'POST', { username, password })).token;
  rl.close();
  console.log('  ✓ تم الدخول');

  step('الهيكل: القسم والمسميات والوردية المرنة');
  const dept = await findOrCreate('/api/departments', (d) => d.name === 'Showroom', '/api/departments', { name: 'Showroom' }, 'قسم Showroom');
  const cashier = await findOrCreate('/api/positions', (p) => p.name === 'Cashier', '/api/positions', { name: 'Cashier' }, 'مسمى Cashier');
  const labor = await findOrCreate('/api/positions', (p) => p.name === 'Labor', '/api/positions', { name: 'Labor' }, 'مسمى Labor');
  const shift = await findOrCreate('/api/shifts', (s) => s.name === 'دوام مرن 8 ساعات (BioTime)', '/api/shifts', {
    name: 'دوام مرن 8 ساعات (BioTime)', type: 'flexible', startTime: '00:00', endTime: '23:59',
    graceMinutes: 0, earlyGraceMinutes: 0, otEnabled: true, otRoundMinutes: 1, halfDayMinutes: 240,
    workDays: '[1,2,3,4,5,6]', active: true,
  }, 'وردية مرنة 00:00-23:59 (8 ساعات)');

  step('الموظفون من العينات');
  const emp = (code, body) => findOrCreate(`/api/employees?search=${code}`, (e) => e.code === code, '/api/employees',
    { code, departmentId: dept.id, weeklyOffDays: '[0]', status: 'active', ...body }, `${code} ${body.name}`);
  const swapan = await emp('FG0033', { name: 'Swapan Nilmoni Nath', nationality: 'Indian', positionId: cashier.id, hireDate: '2023-01-12', basicSalary: 195 });
  const reeyanth = await emp('FG0050', { name: 'Reeyanth Paleretnam Parathithasan', nationality: 'Sri Lanka', positionId: labor.id, hireDate: '2024-04-21', basicSalary: 115 });
  const kiran = await emp('37', { name: 'Kiran (عينة كشف الوقت)', hireDate: '2024-01-01', basicSalary: 150 });

  // ===== 1) Vacation In-Advance Settlement — FG0050 =====
  step('عينة 1: تسوية الإجازة المقدمة — FG0050 (06/06/2026 → 08/08/2026)');
  const types = rows(await api('/api/leave-types'));
  const annual = types.find((t) => /annual/i.test(t.code)) || types[0];
  let leave = rows(await api('/api/leaves')).find((l) => l.employeeId === reeyanth.id && String(l.fromDate).startsWith('2026-06-0'));
  if (!leave) {
    leave = await api('/api/leaves', 'POST', { employeeId: reeyanth.id, leaveTypeId: annual.id, fromDate: '2026-06-06', toDate: '2026-08-08', reason: 'عينة Vacation In-Advance' });
    console.log('  + أُنشئت الإجازة');
  }
  if (leave.status === 'pending') await api(`/api/leaves/${leave.id}`, 'PATCH', { action: 'approve' });
  const vs = await api(`/api/leaves/${leave.id}/settlement`);
  console.log(`  مدة الإجازة: ${vs.breakdown.periodDays} يوم (العينة: 55)`);
  console.log('  الشهر    | أيام عمل | أيام إجازة | المبلغ');
  for (const r of vs.breakdown.rows) {
    console.log(`  ${r.month}  |   ${String(r.workingDays).padStart(2)}     |    ${String(r.vacationDays).padStart(2)}      | ${fmt(r.workingAmount + r.vacationAmount)}`);
  }
  const advOk = Math.abs(vs.breakdown.advanceTotal - 260.962) < 0.0005;
  console.log(`  الإجمالي المقدّم: ${fmt(vs.breakdown.advanceTotal)} د.ك  (العينة 260.962)  ${advOk ? '✅ مطابق' : '❌ مختلف'}`);

  // ===== 2) Final Settlement — FG0033 =====
  step('عينة 2: التسوية النهائية — FG0033 استقالة بتاريخ 27/09/2026');
  const settleBody = {
    employeeId: swapan.id, departureDate: '2026-09-27', reason: 'resigned',
    leaveAllowance: 303.09, // تعويض الإجازات من رصيد MenaITech (40.412 يوم × 7.5) — السجل التاريخي غير موجود في HRHub
    notes: 'عينة Final settlement — MenaITech',
  };
  const pv = await api('/api/settlements', 'POST', { ...settleBody, preview: true });
  console.log(`  أيام الخدمة: ${pv.totalDays} (العينة 1355)`);
  console.log(`  المكافأة كاملة: ${fmt(pv.indemnityFull)} (العينة 417.635) × ${pv.servicePercent}% = ${fmt(pv.eosAmount)} (العينة 208.817)`);
  console.log(`  راتب شهر الترك: ${pv.daysPaid} يوم = ${fmt(pv.worthSalary)} (العينة 23 يوم = 172.500)`);
  console.log(`  تعويض الإجازات: ${fmt(pv.leaveAllowance)} (العينة 303.090)`);
  const setOk = Math.abs(pv.totalDue - 684.407) < 0.0005;
  console.log(`  الإجمالي: ${fmt(pv.totalDue)} د.ك  (العينة 684.407)  ${setOk ? '✅ مطابق' : '❌ مختلف'}`);
  const existing = rows(await api('/api/settlements')).find((s) => s.employee?.code === 'FG0033');
  if (!existing) { await api('/api/settlements', 'POST', settleBody); console.log('  + سُجلت التسوية (تظهر في «المنصرفون والمستحقات» للطباعة)'); }
  else console.log('  ✓ التسوية مسجلة من قبل');

  // ===== 3) Total Time Card — Kiran =====
  step('عينة 3: كشف الوقت — Kiran سبتمبر 2026 (دوام مرن 8 ساعات)');
  const assigns = rows(await api('/api/shift-assignments'));
  if (!assigns.some((a) => a.employeeId === kiran.id && a.shiftId === shift.id)) {
    await api('/api/shift-assignments', 'POST', { employeeIds: [kiran.id], shiftId: shift.id, fromDate: '2026-09-01' });
    console.log('  + أُسندت الوردية المرنة');
  }
  const SN = 'SAMPLE-BIOTIME';
  await findOrCreate('/api/devices', (d) => d.sn === SN, '/api/devices', { sn: SN, name: 'عينة BioTime (بيانات تجريبية)', mode: 'push', enabled: false }, 'جهاز عينة');
  let added = 0;
  for (const [d, inT, outT] of KIRAN_PUNCHES) {
    for (const [t, status] of [[inT, 0], [outT, 1]]) {
      if (!t) continue;
      try {
        await api('/api/attendance-logs', 'POST', { sn: SN, pin: '37', employeeId: kiran.id, punchTime: `2026-09-${d} ${t}:00`, status });
        added++;
      } catch (e) { if (!/مكرر|Unique|duplicate/i.test(e.message)) throw e; }
    }
  }
  console.log(`  + ${added} بصمة جديدة`);
  await api('/api/attendance/recompute', 'POST', { from: '2026-09-01', to: '2026-09-30', employeeId: kiran.id });
  const tc = await api(`/api/reports/time-card?employeeId=${kiran.id}&from=2026-09-01&to=2026-09-30`);
  const col = (name) => tc.columns.indexOf(name);
  const iW = col('ساعات العمل'), iOT = col('إجمالي الإضافي');
  console.log('  اليوم | BioTime عمل | HRHub عمل | HRHub إضافي');
  for (const [d, , , bt] of KIRAN_PUNCHES) {
    const r = tc.rows.find((x) => String(x[0]).endsWith(`-${d}`));
    if (r) console.log(`   ${d}   |   ${bt.padStart(5)}    |   ${String(r[iW]).padStart(5)}   |   ${r[iOT]}`);
  }
  console.log(`  الإجمالي — ساعات العمل: ${tc.statistics.workedHours} (BioTime 223:59) · الإضافي: ${tc.statistics.otTotal} (BioTime 20:59)`);
  console.log('  ملاحظة: كشف BioTime المطبوع يعرض أول وآخر بصمة فقط ويخصم الاستراحات من بصمات وسط اليوم غير الظاهرة —');
  console.log('  لذلك الفرق هنا = وقت الاستراحة. مع بيانات الجهاز الحقيقية (كل البصمات) يحسب HRHub الأزواج ويخصم الاستراحة مثل BioTime.');

  console.log('\nانتهى ✅  افتح الموقع:');
  console.log('  • الإجازات → إجازة FG0050 → «تسوية الإجازة المقدمة» للطباعة');
  console.log('  • المنصرفون والمستحقات → FG0033 → طباعة التسوية النهائية');
  console.log('  • التقارير → كشف الوقت → Kiran → 2026-09-01 إلى 2026-09-30');
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
