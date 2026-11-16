// يعمل مرة واحدة عند تشغيل السيرفر.
// النسخة المكتبية (HRHUB_AUTOPULL_MINUTES) تسحب بصمات كل الأجهزة المحلية تلقائيًا كل N دقيقة،
// لأنها على نفس شبكة الأجهزة. النسخة السحابية لا تصل لشبكة العميل فلا تُفعّله.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const minutes = Number(process.env.HRHUB_AUTOPULL_MINUTES || 0);
  if (!minutes || minutes < 1) return;
  const { pullAllLocalDevices } = await import('@/lib/device-pull');
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await pullAllLocalDevices(); } catch (e) { console.warn('[auto-pull]', e); } finally { running = false; }
  };
  setTimeout(tick, 30_000); // أول سحب بعد اكتمال التشغيل
  setInterval(tick, minutes * 60_000);
  console.log(`[auto-pull] سحب تلقائي من الأجهزة المحلية كل ${minutes} دقيقة`);
}
