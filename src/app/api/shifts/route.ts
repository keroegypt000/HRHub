import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, crudUpdate, crudDelete, CrudConfig } from '@/lib/crud';
import { num } from '@/lib/calc';
import { parseWorkDays } from '@/lib/excel';

export const cfg: CrudConfig = {
  model: 'shift',
  entity: 'shifts',
  label: 'وردية',
  searchFields: ['name'],
  orderBy: { name: 'asc' },
  include: { _count: { select: { assignments: true } } },
  // تجهيز بيانات الوردية قبل الحفظ (يعمل قبل الإنشاء والتعديل)
  validate: (data) => {
    // أيام العمل تأتي من النموذج نصًا "0,1,2,3,4" → تُخزَّن مصفوفة JSON
    if (data.workDaysText !== undefined) {
      const days = [...new Set(parseWorkDays(data.workDaysText, []))].filter((d) => d >= 0 && d <= 6).sort();
      delete data.workDaysText;
      if (!days.length) return 'اختر يوم عمل واحد على الأقل';
      data.workDays = JSON.stringify(days);
    }
    for (const f of ['startTime', 'endTime']) {
      if (data[f] !== undefined && data[f] !== null) {
        const v = String(data[f]).trim().replace(/^(\d):/, '0$1:');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return f === 'startTime' ? 'وقت بداية الوردية غير صحيح (مثال 08:00)' : 'وقت نهاية الوردية غير صحيح (مثال 17:00)';
        data[f] = v;
      }
    }
    if (data.startTime && data.endTime) {
      const later = String(data.endTime) > String(data.startTime);
      if (data.crossDay && later) return 'الوردية تنتهي بعد بدايتها في نفس اليوم — ألغِ اختيار «تعبر منتصف الليل» (تُستخدم للورديات الليلية فقط مثل 22:00 ← 06:00)';
      if (!data.crossDay && !later) data.crossDay = true; // نهاية قبل البداية = وردية ليلية تلقائيًا
    }
    for (const f of ['graceMinutes', 'earlyGraceMinutes', 'otRoundMinutes', 'halfDayMinutes']) {
      if (data[f] !== undefined && data[f] !== null && data[f] !== '') data[f] = Math.max(0, Math.round(num(data[f])));
      else if (data[f] === '' || data[f] === null) delete data[f];
    }
    return null;
  },
  describe: (row) => `${row.name} (${row.startTime}-${row.endTime})`,
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRead(req, 'shifts');
    return crudList(req, user, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    return crudCreate(req, user, cfg);
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    return crudUpdate(req, user, cfg, id);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'shifts');
    const { id } = await ctx.params;
    return crudDelete(req, user, cfg, id);
  });
}
