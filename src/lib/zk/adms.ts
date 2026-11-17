// بروتوكول ZKTeco PUSH (ADMS): ردّ الـ handshake القياسي + الطوابع (Stamps) + طابور الأوامر
// الجهاز يرفع السجلات الأحدث من الطابع الذي نرسله له — None = ارفع كل ما عندك
import { db } from '@/lib/db';

const TABLES = ['ATTLOG', 'OPERLOG', 'ATTPHOTO'] as const;
type Table = (typeof TABLES)[number];
const stampKey = (sn: string, t: Table) => `adms:stamp:${t}:${sn}`;
const cmdKey = (sn: string) => `devicecmd:${sn}`;

export async function getStamp(sn: string, table: Table): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: stampKey(sn, table) } });
  return row?.value || 'None';
}

/** يحفظ آخر طابع وصلنا من الجهاز (حتى لا يعيد رفع كل شيء بعد إعادة التشغيل) */
export async function saveStamp(sn: string, table: string, stamp: string | null) {
  if (!stamp || !/^\d+$/.test(stamp) || !(TABLES as readonly string[]).includes(table)) return;
  const key = stampKey(sn, table as Table);
  const cur = await db.setting.findUnique({ where: { key } });
  if (cur?.value && cur.value !== 'None' && Number(cur.value) >= Number(stamp)) return;
  await db.setting.upsert({ where: { key }, update: { value: stamp }, create: { key, value: stamp } });
}

/** تصفير الطوابع: الجهاز يعيد رفع كل السجلات والصور من البداية */
export async function resetStamps(sn: string) {
  await db.setting.deleteMany({ where: { key: { in: TABLES.map((t) => stampKey(sn, t)) } } });
}

/** ردّ الـ handshake القياسي (GET /iclock/cdata?options=all) */
export async function handshakeText(sn: string): Promise<string> {
  const [att, op, photo] = await Promise.all([getStamp(sn, 'ATTLOG'), getStamp(sn, 'OPERLOG'), getStamp(sn, 'ATTPHOTO')]);
  return [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=${att}`,
    `OPERLOGStamp=${op === 'None' ? '9999' : op}`,
    `ATTPHOTOStamp=${photo}`,
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP UserPic',
    'TimeZone=3',
    'Realtime=1',
    'Encrypt=None',
  ].join('\n');
}

/** إضافة أوامر للجهاز — تُسلَّم في أول getrequest */
export async function queueCommands(sn: string, commands: string[]) {
  const row = await db.setting.findUnique({ where: { key: cmdKey(sn) } });
  let list: string[] = [];
  try { list = row?.value ? (row.value.startsWith('[') ? JSON.parse(row.value) : [row.value]) : []; } catch { list = []; }
  list.push(...commands);
  const value = JSON.stringify(list.slice(-20));
  await db.setting.upsert({ where: { key: cmdKey(sn) }, update: { value }, create: { key: cmdKey(sn), value } });
}

/** أخذ الأوامر المعلقة بصيغة C:<id>:<cmd> ومسحها */
export async function takeCommands(sn: string): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: cmdKey(sn) } });
  if (!row?.value) return [];
  await db.setting.delete({ where: { key: cmdKey(sn) } }).catch(() => {});
  let list: string[];
  try { list = row.value.startsWith('[') ? JSON.parse(row.value) : [row.value]; } catch { list = [row.value]; }
  const base = Date.now() % 100000;
  return list.filter(Boolean).map((c, i) => (c.startsWith('C:') ? c : `C:${base + i}:${c}`));
}

/** أوامر «ارفع كل السجلات والصور والمستخدمين» */
export function fetchAllCommands(): string[] {
  const end = new Date(Date.now() + 3 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  return [
    'CHECK',
    `DATA QUERY ATTLOG StartTime=2000-01-01 00:00:00\tEndTime=${end} 23:59:59`,
    `DATA QUERY ATTPHOTO StartTime=2000-01-01 00:00:00\tEndTime=${end} 23:59:59`,
    'DATA QUERY USERINFO',
  ];
}
