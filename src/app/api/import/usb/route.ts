import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { parseDeviceTime } from '@/lib/zk/protocol';
import { resolveEmployeeByPin, recomputeRange } from '@/lib/attendance';

interface RowResult { row: number; ok: boolean; message: string }

function dateKeySafe(d: Date): string {
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * تحليل ملف USB من أجهزة ZKTeco (X_attlog.dat / ATTLOG.TXT):
 * - سطور الرأس: ~SerialNumber=xxx / ~DeviceName=xxx / ~AttendanceRecords=> تُهمل (وتُستخدم للـ SN)
 * - كل سطر سجلة: pin \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode
 *   بعض الأجهزة تفصل بمسافات أو فواصل — ندعم الثلاثة.
 */
export function parseUsbAttlog(content: string): { sn?: string; punches: { pin: string; punchTime: Date; status: number; verify: number; workCode?: string }[]; failedLines: { row: number; message: string }[] } {
  const lines = content.split(/\r?\n/);
  let sn: string | undefined;
  const punches: { pin: string; punchTime: Date; status: number; verify: number; workCode?: string }[] = [];
  const failedLines: { row: number; message: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // سطر الرأس: ~SerialNumber=CJ9X204860122	Attendance Records=>
    if (line.startsWith('~')) {
      const m = line.match(/~SerialNumber\s*=\s*([^\s\t]+)/i);
      if (m) sn = m[1].trim();
      continue;
    }
    // تعليقات أو أوامر أخرى
    if (line.startsWith('#') || line.toLowerCase().startsWith('pin\t')) continue;

    const parts = line.split(/[\t]+| {2,}|,/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      failedLines.push({ row: i + 1, message: 'سطر غير مفهوم — المتوقع: PIN ثم الوقت' });
      continue;
    }
    const pin = parts[0];
    const punchTime = parseDeviceTime(parts[1]);
    if (!pin || !punchTime) {
      failedLines.push({ row: i + 1, message: parts[1] && pin ? `وقت غير صالح: ${parts[1]}` : 'PIN أو الوقت مفقود' });
      continue;
    }
    const status = parseInt(parts[2] || '0', 10) || 0;
    const verify = parseInt(parts[3] || '1', 10) || 1;
    punches.push({ pin, punchTime, status, verify, workCode: parts[4] || undefined });
  }
  return { sn, punches, failedLines };
}

/**
 * POST /api/import/usb — استيراد ملف بصمات من فلاشة الجهاز (X_attlog.dat)
 * multipart/form-data: file=<الملف>, sn=<اختياري — رقم الجهاز>
 * مصدر السجلات: usb — مع منع التكرار بالقيد الفريد وتقرير لكل صف.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'attendance-logs');
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, 'أرسل الملف بترميز multipart/form-data');
    const file = form.get('file') as File | null;
    if (!file) return fail(400, 'اختر ملف بصمات USB (مثل 1_attlog.dat أو ATTLOG.TXT)');
    if (file.size > 20 * 1024 * 1024) return fail(400, 'الملف أكبر من 20 ميجابايت — قسّمه أو استورد فترات أصغر');

    const content = Buffer.from(await file.arrayBuffer()).toString('utf8');
    // بعض الملفات بترميز UTF-16 (من برامج المرافقة) — كشف بسيط
    const text = content.includes('\u0000')
      ? Buffer.from(await file.arrayBuffer()).toString('utf16le')
      : content;

    const parsed = parseUsbAttlog(text);
    if (!parsed.punches.length) {
      return fail(400, 'لم يُعثر على سجلات صالحة في الملف — تأكد أنه ملف بصمات USB صادر من الجهاز (X_attlog.dat)');
    }

    const snOverride = (form.get('sn') as string | null)?.trim();
    const sn = snOverride || parsed.sn || 'USB-IMPORT';

    // الجهاز: إنشاء موثق إن لم يوجد (كما في استيراد Excel)
    let device = await db.device.findUnique({ where: { sn } });
    if (!device) {
      device = await db.device.create({ data: { sn, name: `استيراد USB ${sn}`, model: 'USB', mode: 'local' } });
    }

    const results: RowResult[] = [];
    let success = 0;
    const affectedDays = new Set<string>();

    for (let i = 0; i < parsed.punches.length; i++) {
      const p = parsed.punches[i];
      const rowNo = i + 1;
      try {
        const emp = await resolveEmployeeByPin(p.pin);
        await db.attendanceLog.create({
          data: {
            sn, pin: p.pin, employeeId: emp?.id || null,
            punchTime: p.punchTime, status: p.status, verify: p.verify,
            workCode: p.workCode, source: 'usb',
          },
        });
        if (emp) affectedDays.add(dateKeySafe(p.punchTime));
        results.push({ row: rowNo, ok: true, message: emp ? `سجلة مربوطة بموظف ${p.pin}` : `سجلة (pin غير معروف: ${p.pin})` });
        success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'خطأ';
        results.push({ row: rowNo, ok: false, message: msg.includes('Unique') ? 'سجلة مكررة — مستوردة سابقًا' : msg });
      }
    }

    const failed = parsed.failedLines.length + results.filter((r) => !r.ok).length;

    // إعادة معالجة الحضور لكل الأيام المتأثرة
    const days = Array.from(affectedDays).sort();
    if (days.length) {
      await recomputeRange({ from: days[0], to: days[days.length - 1] }).catch(() => {});
    }

    await db.importLog.create({
      data: {
        entity: 'usb-attendance', fileName: file.name,
        totalRows: parsed.punches.length, successRows: success, failedRows: failed,
        errors: JSON.stringify([...results.filter((r) => !r.ok), ...parsed.failedLines].slice(0, 500)),
        createdBy: user.id,
      },
    });
    await logAudit({
      userId: user.id, action: 'import', entity: 'attendance-logs',
      description: `استيراد USB (${file.name}) من جهاز ${sn}: ${success} سجلة جديدة، ${failed} فشل/مكرر`,
    });

    return ok({
      imported: success,
      failed,
      totalLines: parsed.punches.length + parsed.failedLines.length,
      deviceSn: sn,
      daysRecomputed: days.length,
      pinUnknown: results.filter((r) => r.ok && r.message.includes('غير معروف')).length,
      results: results.slice(0, 300),
      message: success
        ? `تم استيراد ${success} سجلة من ملف USB (${failed} فشل/مكرر) — أعيد حساب ${days.length} يوم حضور`
        : 'كل سجلات الملف مستوردة مسبقًا أو غير صالحة',
    });
  });
}
