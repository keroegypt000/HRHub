#!/usr/bin/env node
// mock-zk-device.js — محاكي جهاز ZKTeco محلي ببروتوكول ZK عبر TCP منفذ 4370
// يرد على: CMD_CONNECT (1000)، CMD_DATA_WRRQ (1503) للسجلات (0x0d) والمستخدمين (0x09)، CMD_EXIT (1001)
// السجلات بصيغة 40 بايت الموحدة: pin(2-11)، توقيت ZK (27-31)، verify(31)، status(32)
const net = require('net');

const PORT = parseInt(process.env.MOCK_PORT || '4370', 10);

// ترميز وقت ZK: ثوانٍ في تقويم 12 شهر × 31 يوم منذ 2000 — بتوقيت الجهاز المحلي
function encodeTime(d) {
  const y = d.getFullYear() - 2000, mo = d.getMonth(), day = d.getDate();
  const h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds();
  return (((((y * 12 + mo) * 31 + (day - 1)) * 24 + h) * 60 + mi) * 60 + s) >>> 0;
}

function makeRecord40(pin, date, status, verify) {
  const b = Buffer.alloc(40, 0);
  b.writeUInt16LE(1, 0);
  b.write(pin.slice(0, 9).padEnd(9, '\0'), 2, 'ascii');
  b.writeUInt32LE(encodeTime(date), 27);
  b[31] = verify;
  b[32] = status;
  return b;
}

function makeUserRecord72(pin, name) {
  const b = Buffer.alloc(72, 0);
  b.writeUInt16LE(1, 0);
  b.write(pin.slice(0, 9).padEnd(9, '\0'), 2, 'ascii');
  b.write(name.slice(0, 24).padEnd(24, '\0'), 11, 'utf8');
  return b;
}

function innerPacket(cmd, sessionId, replyId) {
  const inner = Buffer.alloc(8);
  inner.writeUInt16LE(cmd, 0);
  inner.writeUInt16LE(0x4321, 2); // checksum غير مُتحقق منه
  inner.writeUInt16LE(sessionId, 4);
  inner.writeUInt16LE(replyId & 0xffff, 6);
  return inner;
}

function tcpReply(command, sessionId, payload = Buffer.alloc(0)) {
  const head = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00]);
  return Buffer.concat([head, innerPacket(command, sessionId, 0), payload]);
}

function sizePrefix(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

// ==== بيانات الجهاز المحاكى ====
const today = new Date();
const at = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d; };
const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
const atY = (h, m) => { const d = new Date(yesterday); d.setHours(h, m, 0, 0); return d; };

const logs = [
  makeRecord40('1001', atY(7, 55), 0, 1),
  makeRecord40('1001', atY(17, 2), 1, 1),
  makeRecord40('1001', at(7, 52), 0, 1),
  makeRecord40('1001', at(17, 10), 1, 1),
  makeRecord40('1002', at(8, 35), 0, 4), // بطاقة
  makeRecord40('1002', at(16, 45), 1, 4),
  makeRecord40('7777', at(9, 0), 0, 1), // pin غير معروف
];
const users = [
  makeUserRecord72('1001', 'أحمد محمد السالم'),
  makeUserRecord72('1002', 'فاطمة علي الخالدي'),
];

const server = net.createServer((sock) => {
  let sessionId = 0;
  sock.on('data', (chunk) => {
    if (chunk.length < 16) return;
    const cmd = chunk.readUInt16LE(8);
    if (cmd === 1000) {
      // CMD_CONNECT — جلسة ثابتة 0x3210
      sessionId = 0x3210;
      const payload = innerPacket(2000, sessionId, 0);
      sock.write(tcpReply(2000, sessionId, payload));
    } else if (cmd === 1503) {
      // CMD_DATA_WRRQ — نوع البيانات في البايت الثانية من الحمولة
      const reqType = chunk[17];
      if (reqType === 0x0d) {
        const data = Buffer.concat([sizePrefix(logs.length * 40), ...logs]);
        sock.write(tcpReply(1501, sessionId, data)); // CMD_DATA مباشرة
      } else if (reqType === 0x09) {
        const data = Buffer.concat([sizePrefix(users.length * 72), ...users]);
        sock.write(tcpReply(1501, sessionId, data));
      } else {
        sock.write(tcpReply(2000, sessionId, innerPacket(2000, sessionId, 0)));
      }
    } else {
      // أي أمر آخر (FREE_DATA / EXIT / OPTIONS...) — ACK_OK
      sock.write(tcpReply(2000, sessionId, innerPacket(2000, sessionId, 0)));
    }
  });
  sock.on('error', () => {});
});

server.listen(PORT, () => console.log(`MOCK ZK DEVICE UP on :${PORT} — ${logs.length} logs, ${users.length} users`));
