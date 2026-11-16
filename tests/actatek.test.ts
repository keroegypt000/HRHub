// جهاز ACTAtek وهمي (REST للفيرموير الحديث و SOAP للقديم) — نفس صيغ الدليل الرسمي
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { pullFromActatek, triggerToStatus, parseActaTime, parseSoapLogs } from '@/lib/actatek';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(150, 3)]).toString('base64');
let mode: 'rest' | 'soap' = 'rest';
let server: http.Server; let port = 0;
const seen: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`);
      if (req.url?.startsWith('/cgi-bin/restapi/')) {
        if (mode !== 'rest') { res.statusCode = 404; return res.end('not found'); }
        if (req.url === '/cgi-bin/restapi/login') {
          const { username, password } = JSON.parse(body);
          return res.end(JSON.stringify(username === 'admin' && password === 'pw' ? { status: 'success', sessionid: 1607225982 } : { status: 'error', message: 'invalid login' }));
        }
        if (req.url.startsWith('/cgi-bin/restapi/getLogs/1607225982/')) {
          return res.end(JSON.stringify([
            { logID: 1, userID: '10', userName: 'Ahmed Ali', timestamp: '2025-02-01T07:22:16', trigger: 'IN', terminalSN: '00111D000000', terminalName: 'Actatek', jpegPhoto: jpeg, accessMethod: 'FACE' },
            { logID: 2, userID: '10', userName: 'Ahmed Ali', timestamp: '2025-02-01T14:59:45', trigger: 'OUT', terminalSN: '00111D000000', terminalName: 'Actatek' },
            { logID: 3, userID: '', timestamp: '2025-02-01T15:00:00', trigger: 'REJECTED', terminalSN: '00111D000000' },
          ]));
        }
        if (req.url.startsWith('/cgi-bin/restapi/logout/')) return res.end('{"status":"success"}');
      }
      if (req.url === '/cgi-bin/rpcrouter') {
        if (body.includes('<ns:login>')) return res.end('<Envelope><Body><ns:loginResponse><sessionID>777</sessionID></ns:loginResponse></Body></Envelope>');
        if (body.includes('<ns:getFullLogs>')) {
          return res.end(`<Envelope><Body><ns:getFullLogsResponse><logs>
<log><logID>9</logID><userID>22</userID><userName>Sara</userName><timestamp>2025-02-02T07:46:27</timestamp><trigger>IN</trigger><terminalSN>X1</terminalSN><jpegPhoto>${jpeg}</jpegPhoto></log>
<log><logID>10</logID><userID>22</userID><timestamp>2025-02-02T14:54:50</timestamp><trigger>OUT</trigger><terminalSN>X1</terminalSN></log>
</logs></ns:getFullLogsResponse></Body></Envelope>`);
        }
        return res.end('<Envelope><Body><status>ok</status></Body></Envelope>');
      }
      res.statusCode = 404; res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.close(); });

const cfg = () => ({ ip: '127.0.0.1', port, username: 'admin', password: 'pw' });
const range: [Date, Date] = [new Date('2025-02-01T00:00:00+03:00'), new Date('2025-02-03T00:00:00+03:00')];

describe('ACTAtek', () => {
  it('الأحداث: IN دخول، OUT خروج، المرفوض يُتجاهل', () => {
    expect([triggerToStatus('IN'), triggerToStatus('OUT'), triggerToStatus('F2'), triggerToStatus('REJECTED')]).toEqual([0, 1, 0, null]);
    expect(parseActaTime('2025-02-01T07:22:16')!.toISOString()).toBe('2025-02-01T04:22:16.000Z');
    expect(parseActaTime('2025-02-01T04:22:16Z')!.toISOString()).toBe('2025-02-01T04:22:16.000Z');
  });

  it('REST: يسحب الحركات بالصورة والاسم ثم يسجل الخروج', async () => {
    mode = 'rest'; seen.length = 0;
    const r = await pullFromActatek(cfg(), ...range);
    expect(r.api).toBe('rest');
    expect(r.punches.map((p) => [p.pin, p.status, p.punchTime.toISOString(), !!p.photo])).toEqual([
      ['10', 0, '2025-02-01T04:22:16.000Z', true],
      ['10', 1, '2025-02-01T11:59:45.000Z', false],
    ]);
    expect(r.punches[0].userName).toBe('Ahmed Ali');
    expect(seen.some((s) => s.startsWith('DELETE /cgi-bin/restapi/logout/1607225982'))).toBe(true);
  });

  it('REST: كلمة سر خطأ → رسالة واضحة', async () => {
    mode = 'rest';
    await expect(pullFromActatek({ ...cfg(), password: 'x' }, ...range)).rejects.toThrow(/تسجيل الدخول/);
  });

  it('SOAP: فيرموير قديم بلا REST → يتحول تلقائيًا إلى SOAP', async () => {
    mode = 'soap';
    const r = await pullFromActatek(cfg(), ...range);
    expect(r.api).toBe('soap');
    expect(r.punches.map((p) => [p.pin, p.status, !!p.photo])).toEqual([['22', 0, true], ['22', 1, false]]);
    expect(parseSoapLogs('<x></x>')).toEqual([]);
  });
});
