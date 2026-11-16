'use client';

// زر تبديل اللغة + تشغيل الترجمة عند فتح البرنامج
import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { getLang, setLang, startLiveTranslation, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function I18nBoot() {
  useEffect(() => {
    if (getLang() !== 'en') return;
    const stop = startLiveTranslation();
    document.documentElement.removeAttribute('data-i18n');
    return stop;
  }, []);
  return null;
}

export function LanguageToggle({ className }: { className?: string }) {
  // الزر يظهر بعد التحميل فقط (شاشات الدخول والبرنامج تُرسم في المتصفح) — نقرأ اللغة مباشرة
  const [lang] = useState<Lang>(() => getLang());
  const next: Lang = lang === 'en' ? 'ar' : 'en';
  return (
    <button
      type="button"
      data-no-translate
      onClick={() => setLang(next)}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted', className)}
      title={next === 'en' ? 'Switch to English' : 'التحويل إلى العربية'}
    >
      <Languages className="h-3.5 w-3.5" />
      {next === 'en' ? 'English' : 'العربية'}
    </button>
  );
}
