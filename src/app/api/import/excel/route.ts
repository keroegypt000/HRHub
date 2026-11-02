import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWrite, ok, fail, handle } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { num } from '@/lib/calc';

interface RowResult { row: number; ok: boolean; message: string }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** استيراد Excel — صفوف JSON مقروءة في المتصفح، تنفيذ جماعي مع تقرير لكل صف */
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
          const code = str(r['الرقم الوظيفي']);
          const name = str(r['الاسم']);
          if (!code || !name) { results.push({ row: rowNo, ok: false, message: 'الرقم الوظيفي والاسم مطلوبان' }); continue; }
          const exists = await db.employee.findUnique({ where: { code } });
          const deptName = str(r['القسم']);
          const posName = str(r['المسمى الوظيفي']);
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
          const hireDate = str(r['تاريخ التعيين']);
          const civilId = str(r['الرقم المدني']) || null;
          const data = {
            code, name,
            gender: str(r['الجنس']) || null,
            nationality: str(r['الجنسية']) || null,
            civilId,
            passportNo: str(r['الجواز']) || null,
            phone: str(r['الهاتف']) || null,
            email: str(r['البريد']) || null,
            departmentId, positionId,
            hireDate: hireDate ? new Date(`${hireDate}T00:00:00.000+03:00`) : null,
            basicSalary: num(r['الراتب الأساسي']),
            bankAccount: str(r['الحساب البنكي']) || null,
            status: str(r['الحالة']) || 'active',
            pin: str(r['PIN البصمة']) || code,
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
          const sn = str(r['الرقم التسلسلي']);
          if (!sn) { results.push({ row: rowNo, ok: false, message: 'الرقم التسلسلي مطلوب' }); continue; }
          const data = {
            sn, name: str(r['الاسم']) || sn,
            model: str(r['الموديل']) || null,
            location: str(r['الموقع']) || null,
            ipAddress: str(r['IP']) || null,
            port: r['المنفذ'] ? Math.round(num(r['المنفذ'])) : null,
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
          const name = str(r['الاسم']);
          if (!name) { results.push({ row: rowNo, ok: false, message: 'اسم الوردية مطلوب' }); continue; }
          const startTime = str(r['بداية']) || '08:00';
          const endTime = str(r['نهاية']) || '17:00';
          const daysStr = str(r['أيام العمل']) || '0,1,2,3,4';
          const data = {
            name,
            type: str(r['النوع']) || 'fixed',
            startTime, endTime,
            crossDay: str(r['تعبر منتصف الليل']) === 'نعم',
            graceMinutes: Math.round(num(r['سماحية التأخير (دقيقة)']) || 10),
            earlyGraceMinutes: Math.round(num(r['سماحية الخروج المبكر']) || 10),
            otEnabled: str(r['إضافي مفعّل']) !== 'لا',
            otRoundMinutes: Math.round(num(r['تقريب الإضافي']) || 15),
            halfDayMinutes: Math.round(num(r['عتبة نص يوم']) || 240),
            workDays: JSON.stringify(daysStr.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x))),
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
          const name = str(r['الاسم']);
          const dateStr = str(r['التاريخ']);
          if (!name || !dateStr) { results.push({ row: rowNo, ok: false, message: 'الاسم والتاريخ مطلوبان' }); continue; }
          const endStr = str(r['تاريخ النهاية']);
          await db.holiday.create({
            data: {
              name,
              date: new Date(`${dateStr}T00:00:00.000+03:00`),
              endDate: endStr ? new Date(`${endStr}T00:00:00.000+03:00`) : null,
              recurring: str(r['متكرر سنويًا']) === 'نعم',
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
          const pin = str(r['الرقم الوظيفي (PIN)']);
          const sn = str(r['الرقم التسلسلي SN']) || 'EXCEL-IMPORT';
          const timeStr = str(r['وقت السجلة']);
          if (!pin || !timeStr) { results.push({ row: rowNo, ok: false, message: 'PIN ووقت السجلة مطلوبان' }); continue; }
          const punchTime = parseDeviceTime(timeStr);
          if (!punchTime) { results.push({ row: rowNo, ok: false, message: `وقت غير صالح: ${timeStr}` }); continue; }
          let device = await db.device.findUnique({ where: { sn } });
          if (!device) {
            device = await db.device.create({ data: { sn, name: `استيراد ${sn}` } });
          }
          const emp = await resolveEmployeeByPin(pin);
          await db.attendanceLog.create({
            data: {
              sn, pin, employeeId: emp?.id || null, punchTime,
              status: Math.round(num(r['الحالة'])) || 0,
              verify: Math.round(num(r['طريقة التحقق'])) || 1,
              source: 'excel',
            },
          });
          results.push({ row: rowNo, ok: true, message: emp ? `سجلة ${emp.id ? 'مربوطة' : ''}` : 'سجلة (pin غير معروف)' });
          success++;
          const kKey = dateKey(punchTime);
          if (!minKey || kKey < minKey) minKey = kKey;
          if (!maxKey || kKey > maxKey) maxKey = kKey;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'خطأ';
          results.push({ row: rowNo, ok: false, message: msg.includes('Unique') ? 'سجلة مكررة' : msg });
        }
      }
      if (minKey && maxKey) await recomputeRange({ from: minKey, to: maxKey }).catch(() => {});
    }
    // ===== مكونات الراتب =====
    else if (entity === 'salary-components') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNo = i + 2;
        try {
          const name = str(r['الاسم']);
          const code = str(r['الرمز']);
          if (!name || !code) { results.push({ row: rowNo, ok: false, message: 'الاسم والرمز مطلوبان' }); continue; }
          const data = {
            name, code,
            type: str(r['النوع']) || 'earning',
            calculation: str(r['طريقة الحساب']) || 'fixed',
            value: num(r['القيمة']),
            percentOfBasic: r['النسبة من الأساسي'] ? num(r['النسبة من الأساسي']) : null,
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
