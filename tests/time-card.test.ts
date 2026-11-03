// الدوام المرن مقابل كشف BioTime (Total Time Card — الموظف 37 Kiran، سبتمبر 2026)
import { describe, expect, it } from 'vitest';
import { flexibleDay, workedFromPunches } from '@/lib/attendance';

const opts = { halfDayMinutes: 240, otRoundMinutes: 1, otEnabled: true };
const hm = (h: number, m: number) => h * 60 + m;

describe('Flexible 00:00-23:59 timetable, 8h duty', () => {
  it('2026-09-01: worked 08:58 → OT 00:58, no lateness', () => {
    expect(flexibleDay(hm(8, 58), 480, opts)).toEqual({ status: 'present', otMinutes: 58, shortMinutes: 0 });
  });

  it('2026-09-12: worked 09:15 → OT 01:15', () => {
    expect(flexibleDay(hm(9, 15), 480, opts).otMinutes).toBe(75);
  });

  it('2026-09-08: worked 05:23 → short 02:37, no OT', () => {
    expect(flexibleDay(hm(5, 23), 480, opts)).toEqual({ status: 'present', otMinutes: 0, shortMinutes: 157 });
  });

  it('OT rounding still applies when configured (15 min)', () => {
    expect(flexibleDay(hm(8, 58), 480, { ...opts, otRoundMinutes: 15 }).otMinutes).toBe(45);
  });

  it('under half a day → half_day', () => {
    expect(flexibleDay(hm(3, 0), 480, opts).status).toBe('half_day');
  });
});

describe('Worked time from punches (breaks excluded like BioTime)', () => {
  const t = (hm: string) => new Date(`2026-09-01T${hm}:00+03:00`);

  it('two punches → first to last', () => {
    expect(workedFromPunches([t('07:45'), t('17:02')])).toBe(9 * 60 + 17);
  });

  it('four punches → sum of in/out pairs (19-minute break excluded = 08:58)', () => {
    expect(workedFromPunches([t('07:45'), t('12:00'), t('12:19'), t('17:02')])).toBe(8 * 60 + 58);
  });

  it('duplicate taps within 2 minutes are merged', () => {
    expect(workedFromPunches([t('07:45'), t('07:46'), t('17:02')])).toBe(9 * 60 + 17);
  });

  it('three punches (odd) → first to last', () => {
    expect(workedFromPunches([t('07:45'), t('12:00'), t('17:02')])).toBe(9 * 60 + 17);
  });

  it('single punch → 0 (missed punch)', () => {
    expect(workedFromPunches([t('07:57')])).toBe(0);
  });
});
