import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
import { parseAttPhoto, parsePhotoName, parseUserPhotos, punchPhotoKey } from '@/lib/zk/photos';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

describe('صور البصمة من أجهزة ZKTeco (ADMS)', () => {
  it('اسم الصورة → وقت البصمة بتوقيت الكويت + PIN', () => {
    const p = parsePhotoName('20250201072216-10.jpg')!;
    expect(p.pin).toBe('10');
    expect(p.punchTime.toISOString()).toBe('2025-02-01T04:22:16.000Z');
  });

  it('ATTPHOTO: رأس نصي ثم \0 ثم JPEG خام', () => {
    const body = Buffer.concat([Buffer.from('PIN=20250201072216-10.jpg\nSN=ABC123\nsize=204\nCMD=uploadphoto'), Buffer.from([0]), jpeg]);
    const ph = parseAttPhoto(body)!;
    expect(ph.pin).toBe('10');
    expect(ph.data.equals(jpeg)).toBe(true);
    expect(punchPhotoKey('ABC123', ph.pin, ph.punchTime)).toBe('ABC123/20250201072216-10.jpg');
  });

  it('ATTPHOTO بصيغة base64 بعد الرأس', () => {
    const body = Buffer.concat([Buffer.from('PIN=20250201145945-10.jpg\nSN=ABC123\nCMD=uploadphoto'), Buffer.from([0]), Buffer.from(jpeg.toString('base64'))]);
    expect(parseAttPhoto(body)!.data.equals(jpeg)).toBe(true);
  });

  it('يرفض جسمًا بلا صورة', () => {
    expect(parseAttPhoto(Buffer.from('PIN=x\nSN=1'))).toBeNull();
  });

  it('USERPIC: صورة الموظف المسجلة على الجهاز', () => {
    const line = `USERPIC PIN=10\tFileName=10.jpg\tSize=204\tContent=${jpeg.toString('base64')}`;
    const out = parseUserPhotos(`OPLOG 4\t0\t2025-02-01 07:00:00\n${line}`);
    expect(out).toHaveLength(1);
    expect(out[0].pin).toBe('10');
  });
});
