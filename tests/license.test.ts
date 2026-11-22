import { describe, it, expect } from 'vitest';
import { verifyLicenseKey } from '@/lib/license';

// مفتاح اختبار لجهاز وهمي (لا يعمل على أي جهاز حقيقي)
const KEY = 'HRHUB-eyJ2IjoxLCJpZCI6IkwyNjExMjItMEY5QjlGIiwiY3VzdG9tZXIiOiJURVNUIE9OTFkiLCJtYWNoaW5lIjoiQUFBQS1CQkJCLUNDQ0MtRERERCIsImlzc3VlZCI6IjIwMjYtMTEtMjIiLCJleHBpcmVzIjoiMjA5OS0xMi0zMSIsIm1heEVtcGxveWVlcyI6NSwibWF4RGV2aWNlcyI6MX0.SvnDvBs_Ug3BnoNlbNVpwVBX5s1uqDS7F4dARBNuf7-Ys51TXxg8PKFt6hmbcVsLJeRZ8r7D1pQQEQqY-cC9Dw';

describe('license keys', () => {
  it('accepts a correctly signed key', () => {
    const p = verifyLicenseKey(KEY);
    expect(p).toMatchObject({ customer: 'TEST ONLY', machine: 'AAAA-BBBB-CCCC-DDDD', expires: '2099-12-31', maxEmployees: 5, maxDevices: 1 });
  });
  it('accepts the key with spaces or line breaks from copy/paste', () => {
    expect(verifyLicenseKey(KEY.slice(0, 30) + '\n ' + KEY.slice(30))).not.toBeNull();
  });
  it('rejects a tampered payload', () => {
    const [data, sig] = KEY.replace('HRHUB-', '').split('.');
    const json = JSON.parse(Buffer.from(data, 'base64url').toString());
    json.maxEmployees = 9999;
    const forged = 'HRHUB-' + Buffer.from(JSON.stringify(json)).toString('base64url') + '.' + sig;
    expect(verifyLicenseKey(forged)).toBeNull();
  });
  it('rejects garbage', () => {
    expect(verifyLicenseKey('hello')).toBeNull();
    expect(verifyLicenseKey('')).toBeNull();
  });
});
