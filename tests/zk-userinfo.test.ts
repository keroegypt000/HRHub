import { describe, it, expect } from 'vitest';
import { parseUSERINFO } from '@/lib/zk/protocol';

describe('parseUSERINFO', () => {
  it('reads PUSH format USER lines inside OPERLOG', () => {
    const body = 'USER PIN=104\tName=Ahmed Ali\tPri=0\tPasswd=\tCard=\tGrp=1\nOPLOG 4\t0\t2026-11-18 10:00:00\t0\t0\t0\t0\nFP PIN=104\tFID=6\tSize=1\tValid=1\tTMP=abc\nUSER PIN=1566\tName=\tPri=0';
    expect(parseUSERINFO(body)).toEqual([
      { pin: '104', name: 'Ahmed Ali', privilege: 0, card: undefined },
      { pin: '1566', name: '', privilege: 0, card: undefined },
    ]);
  });
  it('still reads the legacy tab format', () => {
    expect(parseUSERINFO('158\tMostafa\t0\t\t123')[0]).toMatchObject({ pin: '158', name: 'Mostafa' });
  });
});
