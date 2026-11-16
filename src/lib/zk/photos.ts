// lib/zk/photos.ts — صور أجهزة ZKTeco عبر ADMS Push
// 1) ATTPHOTO: صورة لحظة البصمة (أجهزة الوجه/الكاميرا) — تصل إلى /iclock/fdata أو /iclock/cdata?table=ATTPHOTO
//    الجسم: رأس نصي (PIN=20261116083015-1001.jpg\nSN=...\nsize=N\nCMD=uploadphoto) ثم \0 ثم بيانات JPEG خام
// 2) USERPIC / BIOPHOTO: صورة الموظف المسجلة على الجهاز — سطر داخل OPERLOG/USERINFO: Content=<base64>
import { parseDeviceTime } from '@/lib/zk/protocol';
import { db } from '@/lib/db';
import { saveFile } from '@/lib/storage';
import { resolveEmployeeByPin } from '@/lib/attendance';

export interface PunchPhoto {
  pin: string;
  punchTime: Date;
  fileName: string;
  data: Buffer;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** «20261116083015-1001.jpg» → وقت البصمة + PIN */
export function parsePhotoName(name: string): { pin: string; punchTime: Date } | null {
  const m = name.trim().match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-([A-Za-z0-9_]+)/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, pin] = m;
  const punchTime = parseDeviceTime(`${y}-${mo}-${d} ${h}:${mi}:${s}`);
  return punchTime ? { pin, punchTime } : null;
}

/** فك طلب رفع صورة البصمة (ATTPHOTO) */
export function parseAttPhoto(buf: Buffer): PunchPhoto | null {
  // الرأس ينتهي عند أول \0؛ وإن لم يوجد نبحث عن بداية JPEG مباشرة
  let split = buf.indexOf(0);
  let dataStart = split + 1;
  const jpegAt = buf.indexOf(JPEG);
  if (split < 0 || (jpegAt >= 0 && jpegAt < split)) { split = jpegAt; dataStart = jpegAt; }
  if (split < 0) return null;
  const header = buf.subarray(0, split).toString('latin1');
  let data = buf.subarray(dataStart);
  // بعض الإصدارات ترسل الصورة base64 بعد الرأس
  if (data.indexOf(JPEG) !== 0) {
    const txt = data.toString('latin1').trim();
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(txt) && txt.length > 100) data = Buffer.from(txt, 'base64');
  }
  const jpeg = data.indexOf(JPEG);
  if (jpeg < 0) return null;
  data = data.subarray(jpeg);
  const nameMatch = header.match(/PIN=([^\r\n\t]+)/i);
  if (!nameMatch) return null;
  const parsed = parsePhotoName(nameMatch[1]);
  if (!parsed) return null;
  return { ...parsed, fileName: nameMatch[1].trim(), data: Buffer.from(data) };
}

export interface UserPhoto {
  pin: string;
  data: Buffer;
}

/** أسطر USERPIC/BIOPHOTO (PIN=1001\tFileName=1001.jpg\tSize=..\tContent=base64) */
export function parseUserPhotos(body: string): UserPhoto[] {
  const out: UserPhoto[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^(USERPIC|BIOPHOTO)\b/i.test(line.trim()) && !/Content=/.test(line)) continue;
    const pin = line.match(/PIN=([^\t\s]+)/i)?.[1];
    const content = line.match(/Content=([A-Za-z0-9+/=]+)/)?.[1];
    if (!pin || !content || content.length < 100) continue;
    const data = Buffer.from(content, 'base64');
    if (data.indexOf(JPEG) !== 0) continue;
    out.push({ pin, data });
  }
  return out;
}

// ===== الحفظ في قاعدة البيانات =====

/** مدة الاحتفاظ بصور البصمة (لحماية مساحة قاعدة البيانات) */
export const PUNCH_PHOTO_DAYS = 90;
let lastCleanup = 0;

/** «SN/20261116083015-1001.jpg» — مفتاح الصورة بتوقيت الجهاز (الكويت) */
export function punchPhotoKey(sn: string, pin: string, punchTime: Date): string {
  const t = new Date(punchTime.getTime() + 3 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${sn}/${t}-${pin}.jpg`;
}

/** حذف صور البصمة الأقدم من مدة الاحتفاظ — مرة يوميًا على الأكثر */
async function cleanupOldPhotos() {
  if (Date.now() - lastCleanup < 24 * 3600_000) return;
  lastCleanup = Date.now();
  const before = new Date(Date.now() - PUNCH_PHOTO_DAYS * 24 * 3600_000);
  const old = await db.fileUpload.findMany({ where: { ownerTag: 'punch_photo', createdAt: { lt: before } }, select: { id: true } });
  if (!old.length) return;
  const ids = old.map((o) => o.id);
  await db.attendanceLog.updateMany({ where: { photoId: { in: ids } }, data: { photoId: null } });
  await db.fileUpload.deleteMany({ where: { id: { in: ids } } });
}

/** حفظ صورة البصمة وربطها بالسجلة (إن وصلت السجلة قبلها) */
export async function savePunchPhoto(sn: string, photo: PunchPhoto): Promise<boolean> {
  const key = punchPhotoKey(sn, photo.pin, photo.punchTime);
  const exists = await db.fileUpload.findFirst({ where: { ownerTag: 'punch_photo', fileName: key }, select: { id: true } });
  if (exists) return false;
  const emp = await resolveEmployeeByPin(photo.pin);
  const { id } = await saveFile({ fileName: key, mimeType: 'image/jpeg', data: photo.data, ownerTag: 'punch_photo', employeeId: emp?.id || null });
  await db.attendanceLog.updateMany({ where: { sn, pin: photo.pin, punchTime: photo.punchTime, photoId: null }, data: { photoId: id } });
  await cleanupOldPhotos().catch(() => {});
  return true;
}

/** ربط صور وصلت قبل سجلاتها (يُستدعى بعد إدخال ATTLOG) — استعلام واحد للدفعة */
export async function linkPendingPhotos(sn: string, punches: { pin: string; punchTime: Date }[]) {
  if (!punches.length) return;
  const keys = punches.map((p) => punchPhotoKey(sn, p.pin, p.punchTime));
  const files = await db.fileUpload.findMany({ where: { ownerTag: 'punch_photo', fileName: { in: keys } }, select: { id: true, fileName: true } });
  for (const f of files) {
    const p = punches[keys.indexOf(f.fileName)];
    if (p) await db.attendanceLog.updateMany({ where: { sn, pin: p.pin, punchTime: p.punchTime, photoId: null }, data: { photoId: f.id } });
  }
}

/** صور الموظفين من الجهاز: تُستخدم صورة للملف فقط إن لم يكن له صورة */
export async function saveUserPhotos(photos: UserPhoto[]): Promise<number> {
  let saved = 0;
  for (const ph of photos) {
    const emp = await resolveEmployeeByPin(ph.pin);
    if (!emp) continue;
    const e = await db.employee.findUnique({ where: { id: emp.id }, select: { photoId: true } });
    if (e?.photoId) continue;
    const { id } = await saveFile({ fileName: `device-${ph.pin}.jpg`, mimeType: 'image/jpeg', data: ph.data, ownerTag: 'employee_photo', employeeId: emp.id });
    await db.employee.update({ where: { id: emp.id }, data: { photoId: id } });
    saved++;
  }
  return saved;
}
