import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { num } from '@/lib/calc';
import { pick, parseDateSafe, statusFromText, employeeStatusFromText, parseWorkDays } from '@/lib/excel';

interface RowResult { row: number; ok: boolean; message: string }

/** استيراد Excel — صفوف JSON مقروءة في المتصفح، تنفيذ جماعي مع تقرير لكل صف.
 *  متسامح مع كل الملفات: قالب النظام، ملف التصدير (بأي إصدار)، أو ملف خارجي بأسماء أعمدة شائعة. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'import');
    const url = new URL(req.url);
    const entity = url.searchParams.get('entity') || '';
    const body = (await req.json().catch(() => ({}))) as {
      fileName?: string; rows?: Record<string, unknown>[];
    };
    const rows = body.rows || [];
    if (!rows.length) return fail(400, 'الملف لا يحتوي صفوفًا');
    if (rows.length > 5000) return fail(400, 'الحد الأقصى 5000 صف في المرة — قسّم الملف');

    const results: RowResult[] = [];
    let success = 0;

    // ===== الموظفون =====
    if (entity === 'employees') {
      const departments = await db.department.findMany();
      const positions = await db.position.findMany();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNo = i + 2; // +1 للعنوان
        try {
          const code = pick(r, ['الرقم الوظيفي', 'الكود', 'رقم الموظف']);
          const name = pick(r, ['الاسم', 'اسم الموظف']);
          if (!code || !name) { results.push({ row: rowNo, ok: false, message: 'الرقم الوظيفي والاسم مطلوبان' }); continue; }
          const exists = await db.employee.findUnique({ where: { code } });
          const deptName = pick(r, ['القسم', 'الإدارة']);
          const posName = pick(r, ['المسمى الوظيفي', 'المسمى', 'الوظيفة']);
          let departmentId: string | undefined;
          if (deptName) {
            const found = departments.find((d) => d.name === deptName);
            if (found) departmentId = found.id;
            else {
              const created = await db.department.create({ data: { name: deptName } });
              departments.push(created);
              departmentId = created.id;
            }
          }
          let positionId: string | undefined;
          if (posName) {
            const found = positions.find((p) => p.name === posName);
            if (found) positionId = found.id;
            else {
              const created = await db.position.create({ data: { name: posName } });
              positions.push(created);
              positionId = created.id;
            }
          }
          const hireDate = parseDateSafe(r['تاريخ التعيين']);
          const data = {
            code, name,
            gender: pick(r, ['الجنس']) || null,
            nationality: pick(r, ['الجنسية']) || null,
            civilId: pick(r, ['الرقم المدني', 'المدني']) || null,
            passportNo: pick(r, ['الجواز', 'رقم الجواز']) || null,
            phone: pick(r, ['الهاتف', 'الجوال']) || null,
            email: pick(r, ['البريد', 'البريد الإلكتروني']) || null,
            departmentId, positionId,
            hireDate,
            basicSalary: num(r['الراتب الأساسي']),
            bankAccount: pick(r, ['الحساب البنكي', 'رقم الحساب']) || null,
            status: employeeStatusFromText(r['الحالة']),
            // PIN اختياري تمامًا: يقبل «PIN البصمة» أو «PIN» أو يرجع للرقم الوظيفي تلقائيًا
            pin: pick(r, ['PIN البصمة', 'PIN', 'pin']) || code,
          };
          if (exists) {
            await db.employee.update({ where: { code }, data });
            results.push({ row: rowNo, ok: true, message: `تحديث موظف قائم: ${name}` });
          } else {
            await db.employee.create({ data });
            results.push({ row: rowNo, ok: true, message: `إنشاء موظف: ${name}` });
          }
          success++;
        } catch (e) {
          results.push({ row: rowNo, ok: false, message: e instanceof Error ? e.message : 'خطأ غير معروف' });
        }
      }
    }
    // ===== الأجهزة =====
    else if (entity === 'devices') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          const sn = pick(r, ['الرقم التسلسلي', 'SN', 'الرقم التسلسلي SN']);
          if (!sn) { results.push({ row: rowNo, ok: false, message: 'الرقم التسلسلي مطلوب' }); continue; }
          const portVal = num(pick(r, ['المنفذ', 'Port']));
          const data = {
            sn, name: pick(r, ['الاسم']) || sn,
            model: pick(r, ['الموديل']) || null,
            location: pick(r, ['الموقع']) || null,
            ipAddress: pick(r, ['IP', 'الـ IP']) || null,
            port: portVal > 0 ? Math.round(portVal) : null,
          };
          await db.device.upsert({ where: { sn }, update: data, create: data });
          results.push({ row: rowNo, ok: true, message: `جهاز: ${data.name}` });
          success++;
        } catch (e) {
          results.push({ row: rowNo, ok: false, message: e instanceof Error ? e.message : 'خطأ' });
        }
      }
    }
    // ===== الورديات =====
    else if (entity === 'shifts') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          const name = pick(r, ['الاسم', 'اسم الوردية']);
          if (!name) { results.push({ row: rowNo, ok: false, message: 'اسم الوردية مطلوب' }); continue; }
          const startTime = pick(r, ['بداية', 'وقت البداية']) || '08:00';
          const endTime = pick(r, ['نهاية', 'وقت النهاية']) || '17:00';
          const data = {
            name,
            type: pick(r, ['النوع']) || 'fixed',
            startTime, endTime,
            crossDay: pick(r, ['تعبر منتصف الليل']) === 'نعم',
            graceMinutes: Math.round(num(pick(r, ['سماحية التأخير (دقيقة)', 'سماحية التأخير'])) || 10),
            earlyGraceMinutes: Math.round(num(pick(r, ['سماحية الخروج المبكر', 'سماحية المبكر'])) || 10),
            otEnabled: pick(r, ['إضافي مفعّل', 'إضافي']) !== 'لا',
            otRoundMinutes: Math.round(num(pick(r, ['تقريب الإضافي'])) || 15),
            halfDayMinutes: Math.round(num(pick(r, ['عتبة نص يوم'])) || 240),
            workDays: JSON.stringify(parseWorkDays(r['أيام العمل'])),
          };
          const exists = await db.shift.findFirst({ where: { name } });
          if (exists) {
            await db.shift.update({ where: { id: exists.id }, data });
            results.push({ row: rowNo, ok: true, message: `تحديث وردية: ${name}` });
          } else {
            await db.shift.create({ data });
            results.push({ row: rowNo, ok: true, message: `إنشاء وردية: ${name}` });
          }
          success++;
        } catch (e) {
          results.push({ row: rowNo, ok: false, message: e instanceof Error ? e.message : 'خطأ' });
        }
      }
    }
    // ===== العطلات =====
    else if (entity === 'holidays') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          const name = pick(r, ['الاسم', 'اسم العطلة']);
          const date = parseDateSafe(r['التاريخ']);
          if (!name || !date) { results.push({ row: rowNo, ok: false, message: 'الاسم والتاريخ مطلوبان' }); continue; }
          const endDate = parseDateSafe(r['تاريخ النهاية'] ?? r['حتى']);
          await db.holiday.create({
            data: {
              name,
              date,
              endDate,
              recurring: pick(r, ['متكرر سنويًا', 'متكرر']) === 'نعم',
            },
          });
          results.push({ row: rowNo, ok: true, message: `عطلة: ${name}` });
          success++;
        } catch (e) {
          results.push({ row: rowNo, ok: false, message: e instanceof Error ? e.message : 'خطأ' });
        }
      }
    }
    // ===== سجل البصمة =====
    else if (entity === 'attendance-logs') {
      const { parseDeviceTime } = await import('@/lib/zk/protocol');
      const { resolveEmployeeByPin, recomputeRange } = await import('@/lib/attendance');
      const { dateKey } = await import('@/lib/time');
      let minKey: string | null = null;
      let maxKey: string | null = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          // PIN: يقبل عمود القالب أو عمود التصدير أو «الرقم»
          const pin = pick(r, ['الرقم الوظيفي (PIN)', 'PIN', 'pin', 'الرقم']);
          const sn = pick(r, ['الرقم التسلسلي SN', 'SN', 'الرقم التسلسلي']) || 'EXCEL-IMPORT';
          // وقت السجلة: عمود واحد أو التاريخ + الوقت منفصلين (كما في ملفات التصدير القديمة)
          let timeStr = pick(r, ['وقت السجلة', 'وقت البصمة', 'التاريخ والوقت']);
          if (!timeStr) {
            const d = pick(r, ['التاريخ']);
            const t = pick(r, ['الوقت']);
            if (d && t) timeStr = `${d} ${t.length === 5 ? `${t}:00` : t}`;
            else if (d) timeStr = `${d} 00:00:00`;
          }
          if (!pin || !timeStr) {
            results.push({ row: rowNo, ok: false, message: 'PIN ووقت السجلة مطلوبان — استخدم ملف التصدير الجديد أو قالب الاستيراد' });
            continue;
          }
          const punchTime = parseDeviceTime(timeStr) ?? parseDateSafe(timeStr.replace(' ', 'T'));
          if (!punchTime) { results.push({ row: rowNo, ok: false, message: `وقت غير صالح: ${timeStr}` }); continue; }
          let device = await db.device.findUnique({ where: { sn } });
          if (!device) {
            device = await db.device.create({ data: { sn, name: `استيراد ${sn}` } });
          }
          const emp = await resolveEmployeeByPin(pin);
          await db.attendanceLog.create({
            data: {
              sn, pin, employeeId: emp?.id || null, punchTime,
              status: statusFromText(r['الحالة']),
              verify: Math.round(num(pick(r, ['طريقة التحقق']))) || 1,
              source: 'excel',
            },
          });
          results.push({ row: rowNo, ok: true, message: emp ? `سجلة مربوطة بالموظف` : 'سجلة (pin غير معروف)' });
          success++;
          const kKey = dateKey(punchTime);
          if (!minKey || kKey < minKey) minKey = kKey;
          if (!maxKey || kKey > maxKey) maxKey = kKey;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'خطأ';
          results.push({ row: rowNo, ok: false, message: msg.includes('Unique') ? 'سجلة مكررة (موجودة مسبقًا)' : msg });
        }
      }
      if (minKey && maxKey) await recomputeRange({ from: minKey, to: maxKey }).catch(() => {});
    }
    // ===== مكونات الراتب =====
    else if (entity === 'salary-components') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          const name = pick(r, ['الاسم']);
          const code = pick(r, ['الرمز', 'الكود']);
          if (!name || !code) { results.push({ row: rowNo, ok: false, message: 'الاسم والرمز مطلوبان' }); continue; }
          const data = {
            name, code,
            type: pick(r, ['النوع']) || 'earning',
            calculation: pick(r, ['طريقة الحساب']) || 'fixed',
            value: num(r['القيمة']),
            percentOfBasic: r['النسبة من الأساسي'] !== undefined && r['النسبة من الأساسي'] !== null && r['النسبة من الأساسي'] !== ''
              ? num(r['النسبة من الأساسي']) : null,
            order: Math.round(num(r['الترتيب'])) || 99,
          };
          await db.salaryComponent.upsert({ where: { code }, update: data, create: data });
          results.push({ row: rowNo, ok: true, message: `مكوّن: ${name}` });
          success++;
        } catch (e) {
          results.push({ row: rowNo, ok: false, message: e instanceof Error ? e.message : 'خطأ' });
        }
      }
    } else {
      return fail(400, 'كيان استيراد غير معروف — employees|devices|shifts|holidays|attendance-logs|salary-components');
    }

    const failed = rows.length - success;
    await db.importLog.create({
      data: {
        entity, fileName: body.fileName || 'import.xlsx',
        totalRows: rows.length, successRows: success, failedRows: failed,
        errors: JSON.stringify(results.filter((r) => !r.ok)),
        createdBy: user.id,
      },
    });
    await logAudit({
      userId: user.id, action: 'import', entity,
      description: `استيراد ${entity}: ${success} نجح / ${failed} فشل من ${rows.length} صف`,
    });
    return ok({ total: rows.length, success, failed, results });
  });
}
