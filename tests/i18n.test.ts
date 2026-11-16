import { describe, it, expect } from 'vitest';
import { tr } from '@/lib/i18n';

describe('الترجمة الإنجليزية', () => {
  it('نصوص ثابتة', () => {
    expect(tr('لوحة التحكم')).toBe('Dashboard');
    expect(tr('  إضافة جهاز ')).not.toMatch(/[\u0600-\u06FF]/);
    expect(tr('أجهزة البصمة')).toBe('Fingerprint devices');
  });
  it('قوالب بقيم متغيرة', () => {
    expect(tr('تم الاتصال بالجهاز بنجاح — عليه 10152 بصمة و14 موظف')).toBe('Connected to the device — it has 10152 punches and 14 employees');
    expect(tr('انتهت مهلة الاتصال بالجهاز 192.168.1.199')).toBe('Connection to device 192.168.1.199 timed out');
    expect(tr('تم إنشاء وردية')).toBe('Shift created');
  });
  it('النص غير العربي يبقى كما هو', () => {
    expect(tr('192.168.1.200:4370')).toBe('192.168.1.200:4370');
  });
});

describe('حالات خاصة', () => {
  it('الأحرف الأولى للاسم لا تتشوه، والدقائق تُترجم', () => {
    expect(tr('مد')).toBe('مد');
    expect(tr('15د')).toBe('15m');
  });
});

describe('أجزاء ملاصقة لقيم', () => {
  it('سماحية الوردية والإضافي', () => {
    expect(tr('د / ')).toBe('m / ');
    expect(tr('د تقريب)')).toBe('m rounding)');
  });
});

describe('موظفو الوردية', () => {
  it('رسائل الربط', () => {
    expect(tr('تم ربط 3 موظف بالوردية — 2 نُقلوا من ورديات أخرى')).toBe('3 employees assigned to the shift — 2 moved from other shifts');
    expect(tr('حاليًا: الوردية الصباحية')).toBe('Current: Morning shift');
  });
});

describe('الاستثناءات والإجمالي', () => {
  it('ترجمات جديدة', () => {
    expect(tr('الإجمالي (12)')).toBe('Total (12)');
    expect(tr('استثناء HR: مأمورية (تأخير مُبرَّر)')).toBe('HR exception: مأمورية (Late excused)'.replace('مأمورية (Late excused)', tr('مأمورية (تأخير مُبرَّر)')));
  });
});

describe('شاشة التقارير', () => {
  it('ترجمات الفلاتر والإجماليات', () => {
    expect(tr('إجمالي Ali (3)')).toBe('Total Ali (3)');
    expect(tr('الفترة: 2026-11-01 → 2026-11-16')).toBe('Period: 2026-11-01 → 2026-11-16');
    expect(tr('هذا الشهر')).toBe('This month');
  });
});
