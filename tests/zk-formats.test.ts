// صيغ سجلات ZKTeco الأقدم (UDP): بيانات حقيقية من جهاز 192.168.1.200 (سجلات 16 بايت ومستخدمون 28 بايت)
import { describe, it, expect } from 'vitest';
import { decodeAttendanceRecords, decodeUserRecords } from '@/lib/zk/local';

const hex = (s: string) => Buffer.from(s, 'hex');
const k = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

describe('ZKTeco UDP — الصيغ القديمة', () => {
  it('سجلات 16 بايت: user_id(4) + الوقت', () => {
    const data = hex('20000000' + '04870100a53c0c2e0000ff0000000000' + '9e000000ac940c2e0000ff0000000000');
    const r = decodeAttendanceRecords(data, 2);
    expect(r.map((p) => [p.pin, k(p.punchTime)])).toEqual([['100100', '2024-01-14 14:18:13'], ['158', '2024-01-14 20:33:48']]);
  });

  it('مستخدمون 28 بايت: الاسم + رقم الموظف', () => {
    const data = hex('38000000'
      + '01000000000000004d6f73746166610000000000000100009e000000'
      + '0200000000000000416c69467268617400000000000100006600000000');
    const u = decodeUserRecords(data.subarray(0, 4 + 56), 2);
    expect(u.map((x) => [x.uid, x.pin, x.name])).toEqual([[1, '158', 'Mostafa'], [2, '102', 'AliFrhat']]);
  });
});
