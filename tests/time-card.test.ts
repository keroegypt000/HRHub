// الدوام المرن مقابل كشف BioTime (Total Time Card — الموظف 37 Kiran، سبتمبر 2026)
import { describe, expect, it } from 'vitest';
import { flexibleDay } from '@/lib/attendance';

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
