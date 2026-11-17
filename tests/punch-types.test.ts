import { describe, it, expect } from 'vitest';
import { inferPunchTypes } from '@/lib/punch-types';

const t = (hm: string) => new Date(`2026-11-01T${hm}:00Z`);

describe('inferPunchTypes', () => {
  it('first is in, last is out regardless of device button', () => {
    expect(inferPunchTypes([t('08:00'), t('16:00')])).toEqual(['دخول', 'خروج']);
  });
  it('handles unsorted input, breaks and duplicates', () => {
    expect(inferPunchTypes([t('16:00'), t('08:00'), t('08:01'), t('12:00'), t('12:30')]))
      .toEqual(['خروج', 'دخول', 'تكرار', 'خروج استراحة', 'عودة من استراحة']);
  });
  it('single punch is in without out', () => {
    expect(inferPunchTypes([t('08:00'), t('08:01')])).toEqual(['دخول (بدون خروج)', 'تكرار']);
  });
});
