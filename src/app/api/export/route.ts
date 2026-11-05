import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRead, handle, HttpError } from '@/lib/api';
import { exportBuffer, workDaysToText } from '@/lib/excel';
import { offDaysText } from '@/lib/workweek';
import { kuwaitMidnight, dateKey, fmtTime, fmtDate } from '@/lib/time';
import { tafqitKWD } from '@/lib/tafqit';

/** أسماء عربية لحالات الحضور في ملفات التصدير */
const STATUS_AR: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', half_day: 'نص يوم', absent: 'غائب',
  leave: 'في إجازة', holiday: 'عطلة رسمية', weekend: 'راحة أسبوعية', missed_punch: 'بصمة ناقصة',
};

/** تصدير أي قسم Excel بفلاتره الحالية — incl. ملف البنك للرواتب المصروفة */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'export');
    const url = new URL(req.url);
    const entity = url.searchParams.get('entity') || '';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const departmentId = url.searchParams.get('departmentId');
    const status = url.searchParams.get('status');
    const employeeId = url.searchParams.get('employeeId');
    const periodId = url.searchParams.get('periodId');

    let rows: Record<string, string | number>[] = [];
    let fileName = `hrhub-${entity}`;

    switch (entity) {
      case 'employees': {
        const emps = await db.employee.findMany({
          where: departmentId && departmentId !== 'all' ? { departmentId } : {},
          include: { department: true, position: true },
          orderBy: { code: 'asc' },
        });
        rows = emps.map((e) => ({
          // نفس أسماء أعمدة قالب الاستيراد حرفيًا — الملف المصدر يشتغل استيرادًا مباشرة
          'الرقم الوظيفي': e.code, 'الاسم': e.name, 'الجنس': e.gender || '', 'الجنسية': e.nationality || '',
          'الرقم المدني': e.civilId || '', 'الجواز': e.passportNo || '', 'الهاتف': e.phone || '', 'البريد': e.email || '',
          'القسم': e.department?.name || '', 'المسمى الوظيفي': e.position?.name || '',
          'تاريخ التعيين': e.hireDate ? fmtDate(e.hireDate) : '', 'الراتب الأساسي': e.basicSalary,
          'الحساب البنكي': e.bankAccount || '', 'الحالة': e.status, 'PIN البصمة': e.pin || e.code,
          'يوم الراحة': offDaysText(e.weeklyOffDays),
          'رصيد الإجازة الافتتاحي': e.openingLeaveBalance ?? '', 'تاريخ الرصيد': e.openingLeaveDate ? fmtDate(e.openingLeaveDate) : '',
          'يستحق الإضافي': e.otEligible ? 'نعم' : 'لا', 'معفى من البصمة': e.attendanceExempt ? 'نعم' : 'لا',
        }));
        break;
      }
      case 'devices': {
        const devices = await db.device.findMany({ orderBy: { name: 'asc' } });
        rows = devices.map((d) => ({
          'الرقم التسلسلي': d.sn, 'الاسم': d.name, 'الموديل': d.model || '', 'الموقع': d.location || '',
          'IP': d.ipAddress || '', 'المنفذ': d.port || '', 'الحالة': d.status, 'آخر ظهور': d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : '—',
        }));
        break;
      }
      case 'shifts': {
        const shifts = await db.shift.findMany({ orderBy: { name: 'asc' } });
        rows = shifts.map((s) => ({
          'الاسم': s.name, 'النوع': s.type, 'بداية': s.startTime, 'نهاية': s.endTime,
          'تعبر منتصف الليل': s.crossDay ? 'نعم' : 'لا', 'سماحية التأخير (دقيقة)': s.graceMinutes,
          'سماحية الخروج المبكر': s.earlyGraceMinutes, 'إضافي مفعّل': s.otEnabled ? 'نعم' : 'لا',
          'تقريب الإضافي': s.otRoundMinutes, 'عتبة نص يوم': s.halfDayMinutes, 'أيام العمل': workDaysToText(s.workDays),
        }));
        break;
      }
      case 'attendance-logs': {
        const where: Record<string, unknown> = {};
        if (from || to) {
          where.punchTime = {
            ...(from ? { gte: kuwaitMidnight(from) } : {}),
            ...(to ? { lt: new Date(kuwaitMidnight(to).getTime() + 86400_000) } : {}),
          };
        }
        if (employeeId && employeeId !== 'all') where.employeeId = employeeId;
        const logs = await db.attendanceLog.findMany({
          where,
          include: { employee: { select: { name: true, code: true } }, device: { select: { name: true } } },
          orderBy: { punchTime: 'desc' },
          take: 20000,
        });
        rows = logs.map((l) => ({
          // أعمدة الاستيراد نفسها + أعمدة عرض إضافية يتجاهلها الاستيراد
          'الرقم الوظيفي (PIN)': l.pin, 'الرقم التسلسلي SN': l.sn,
          'وقت السجلة': `${dateKey(l.punchTime)} ${fmtTime(l.punchTime)}:00`,
          'الحالة': l.status, 'طريقة التحقق': l.verify,
          'الموظف': l.employee?.name || '', 'الجهاز': l.device?.name || l.sn, 'المصدر': l.source,
        }));
        break;
      }
      case 'daily-attendance': {
        const where: Record<string, unknown> = {};
        if (from || to) where.date = { ...(from ? { gte: kuwaitMidnight(from) } : {}), ...(to ? { lte: kuwaitMidnight(to) } : {}) };
        if (status && status !== 'all') where.status = status;
        if (employeeId && employeeId !== 'all') where.employeeId = employeeId;
        if (departmentId && departmentId !== 'all') where.employee = { departmentId };
        const daily = await db.dailyAttendance.findMany({
          where,
          include: { employee: { select: { name: true, code: true, department: true } }, shift: { select: { name: true } } },
          orderBy: [{ date: 'desc' }, { employee: { name: 'asc' } }],
          take: 20000,
        });
        rows = daily.map((r) => ({
          'التاريخ': dateKey(r.date), 'الموظف': r.employee.name, 'الرقم': r.employee.code,
          'القسم': r.employee.department?.name || '', 'الوردية': r.shift?.name || '',
          'الحالة': STATUS_AR[r.status] || r.status, 'الدخول': fmtTime(r.firstIn), 'الخروج': fmtTime(r.lastOut),
          'دقائق العمل': r.workedMinutes, 'تأخير': r.lateMinutes, 'مبكر': r.earlyMinutes, 'إضافي': r.otMinutes,
        }));
        break;
      }
      case 'payroll': {
        const where: Record<string, unknown> = periodId ? { periodId } : {};
        const slips = await db.payslip.findMany({
          where,
          include: {
            employee: { select: { name: true, code: true, bankAccount: true, department: true } },
            period: true,
          },
          orderBy: { employeeId: 'asc' },
          take: 20000,
        });
        rows = slips.map((p) => ({
          'الفترة': p.period.name, 'الرقم الوظيفي': p.employee.code, 'الاسم': p.employee.name,
          'القسم': p.employee.department?.name || '',
          'الأساسي': p.basicSalary, 'المكملات': p.totalEarnings, 'الاستقطاعات': p.totalDeductions,
          'الصافي': p.netPay, 'أيام العمل': p.workedDays, 'الغياب': p.absenceDays,
          'ساعات إضافي': p.otHours, 'دقائق تأخير': p.lateMinutes,
          'الحالة': p.status, 'الحساب البنكي': p.employee.bankAccount || '',
          'التفقيط': tafqitKWD(p.netPay),
        }));
        break;
      }
      case 'bank': {
        // ملف البنك: الرقم الوظيفي، الاسم، رقم الحساب، الصافي — لفترة معتمدة/مصروفة
        if (!periodId) throw new HttpError(400, 'حدد الفترة لتصدير ملف البنك');
        const period = await db.payrollPeriod.findUnique({
          where: { id: periodId },
          include: { payslips: { include: { employee: true } } },
        });
        if (!period) throw new HttpError(404, 'الفترة غير موجودة');
        rows = period.payslips.map((p) => ({
          'الرقم الوظيفي': p.employee.code,
          'الاسم': p.employee.name,
          'رقم الحساب': p.employee.bankAccount || '',
          'الصافي': p.netPay,
        }));
        fileName = `hrhub-bank-${period.name}`;
        break;
      }
      case 'holidays': {
        const holidays = await db.holiday.findMany({ orderBy: { date: 'asc' } });
        rows = holidays.map((h) => ({
          'الاسم': h.name, 'التاريخ': fmtDate(h.date), 'تاريخ النهاية': h.endDate ? fmtDate(h.endDate) : '',
          'متكرر سنويًا': h.recurring ? 'نعم' : 'لا',
        }));
        break;
      }
      case 'leaves': {
        const leaves = await db.leaveRequest.findMany({
          include: { employee: { select: { name: true, code: true } }, leaveType: true },
          orderBy: { fromDate: 'desc' },
          take: 20000,
        });
        rows = leaves.map((l) => ({
          'الموظف': l.employee.name, 'الرقم': l.employee.code, 'النوع': l.leaveType.name,
          'من': fmtDate(l.fromDate), 'إلى': fmtDate(l.toDate), 'الأيام': l.days,
          'الحالة': l.status, 'السبب': l.reason || '',
        }));
        break;
      }
      default:
        throw new HttpError(404, 'كيان تصدير غير معروف');
    }

    // ملف البنك CSV بترميز UTF-8 مع BOM لفتحه في Excel بالعربية — جاهز للرفع على نظام البنك
    if (entity === 'bank') {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const csv = [cols.join(',')]
        .concat(rows.map((r) => cols.map((c) => {
          const v = String((r as Record<string, unknown>)[c] ?? '');
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(',')))
        .join('\r\n');
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}.csv"`,
        },
      });
    }

    const buf = exportBuffer(entity, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}.xlsx"`,
      },
    });
  });
}

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}
