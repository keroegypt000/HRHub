// قراءة أعمدة Excel الإضافية لنقل الموظفين من MenaITech
import { describe, expect, it } from 'vitest';
import { parseOffDays, yesNo } from '@/lib/excel';

describe('parseOffDays', () => {
  it('أسماء الأيام بالعربي', () => {
    expect(parseOffDays('الأحد')).toBe('[0]');
    expect(parseOffDays('الجمعة والسبت')).toBe('[5,6]');
    expect(parseOffDays('الإثنين')).toBe('[1]');
  });
  it('أرقام وفارغ وبدون', () => {
    expect(parseOffDays('5,6')).toBe('[5,6]');
    expect(parseOffDays('')).toBe(null);
    expect(parseOffDays('بدون راحة')).toBe('[]');
  });
});

describe('yesNo', () => {
  it('نعم/لا/فارغ', () => {
    expect(yesNo('نعم')).toBe(true);
    expect(yesNo('لا')).toBe(false);
    expect(yesNo('')).toBe(undefined);
    expect(yesNo(1)).toBe(true);
  });
});
