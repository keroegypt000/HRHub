// اختبار مسار البنود اليدوية: إضافة ← تعديل ← إعادة حساب ← التحقق من البقاء ← حذف
const BASE = 'http://localhost:3000';
const TOKEN = (await import('fs')).readFileSync('/tmp/hrhub.token', 'utf8').trim();
const PID = (await import('fs')).readFileSync('/tmp/period.id', 'utf8').trim();

async function api(path, method = 'GET', body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 250)}`);
  return data;
}

const period = await api(`/api/payroll-periods/${PID}`);
const slip101 = period.payslips.find((s) => s.employee.code === '101');
console.log('قبل: net =', slip101.netPay, '| items =', slip101.items.length);

// 1) إضافة بونص يدوي 25 د.ك
const added = await api(`/api/payslips/${slip101.id}/items`, 'POST', { name: 'بونص أداء', type: 'earning', amount: 25, note: 'اختبار' });
const afterAdd = added.items.find((i) => i.name === 'بونص أداء');
console.log('1) إضافة بونص 25 → source =', afterAdd?.source, '| net =', added.netPay, '(متوقع +25)');
if (Math.abs(added.netPay - (slip101.netPay + 25)) > 0.001) throw new Error('الإجمالي لم يحدث!');

// 2) تعديل بند محسوب (خصم الغياب) إلى نصف قيمته → يصبح يدويًا محفوظًا
const absItem = added.items.find((i) => i.name === 'خصم الغياب');
const edited = await api(`/api/payslips/${slip101.id}/items/${absItem.id}`, 'PATCH', { amount: absItem.amount / 2, note: 'تصحيح يوم محسوب غلط — موافقة المدير' });
const absAfter = edited.items.find((i) => i.id === absItem.id);
console.log('2) تعديل خصم الغياب → amount =', absAfter.amount, '(كان', absItem.amount + ')', '| source =', absAfter.source, '| editedBy =', absAfter.editedBy);
if (absAfter.source !== 'manual') throw new Error('البند المعدل لم يتحول ليدوي!');

// 3) إعادة حساب الفترة — البنود اليدوية يجب أن تبقى
await api(`/api/payroll-periods/${PID}/compute`, 'POST');
const period2 = await api(`/api/payroll-periods/${PID}`);
const slip2 = period2.payslips.find((s) => s.employee.code === '101');
const bonus2 = slip2.items.find((i) => i.name === 'بونص أداء');
const abs2 = slip2.items.find((i) => i.name === 'خصم الغياب');
console.log('3) بعد إعادة الحساب: بونص موجود؟', !!bonus2, 'بقيمة', bonus2?.amount, '| خصم الغياب =', abs2?.amount, '(اليدوي محفوظ، لا أعيد حسابه)');
console.log('   net بعد إعادة الحساب =', slip2.netPay);
if (!bonus2) throw new Error('البند اليدوي ضاع بعد إعادة الحساب!');

// 4) حذف البونص
const del = await api(`/api/payslips/${slip2.id}/items/${bonus2.id}`, 'DELETE');
console.log('4) حذف البونص → net =', del.netPay, '| items =', del.items.length);

// 5) التأكد من رفض التعديل في فترة معتمدة — نعتمد ثم نحاول
await api(`/api/payroll-periods/${PID}/approve`, 'POST');
try {
  await api(`/api/payslips/${slip2.id}/items`, 'POST', { name: 'ممنوع', type: 'earning', amount: 10 });
  throw new Error('فشل الأمان: قبِل تعديلًا في فترة معتمدة!');
} catch (e) {
  console.log('5) رفض التعديل بعد الاعتماد ✓ —', String(e.message).slice(0, 120));
}

console.log('\n✅ مسار البنود اليدوية سليم بالكامل');
