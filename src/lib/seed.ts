// lib/seed.ts — البيانات الافتراضية عند أول تشغيل: أنواع إجازات، مكونات راتب، وردية افتراضية
import { db } from '@/lib/db';

export async function seedDefaults(): Promise<void> {
  // أنواع الإجازات الافتراضية (القاعدة الكويتية)
  const leaveTypes = [
    { name: 'إجازة سنوية', code: 'ANNUAL', paid: true, quotaDays: 35, color: '#1F8A70' },
    { name: 'إجازة مرضية', code: 'SICK', paid: true, quotaDays: 15, color: '#3B82F6' },
    { name: 'إجازة طارئة', code: 'EMERGENCY', paid: true, quotaDays: 5, color: '#F59E0B' },
    { name: 'إجازة بدون راتب', code: 'UNPAID', paid: false, quotaDays: null, color: '#EF4444' },
    { name: 'إجازة أمومة', code: 'MATERNITY', paid: true, quotaDays: 70, color: '#8B5CF6' },
  ];
  for (const lt of leaveTypes) {
    await db.leaveType.upsert({ where: { code: lt.code }, update: {}, create: lt });
  }

  // مكونات الراتب الافتراضية
  const components = [
    { name: 'الراتب الأساسي', code: 'BASIC', type: 'earning', calculation: 'fixed', value: 0, order: 1 },
    { name: 'بدل سكن', code: 'HOUSING', type: 'earning', calculation: 'percent', percentOfBasic: 30, value: 0, order: 2 },
    { name: 'بدل مواصلات', code: 'TRANSPORT', type: 'earning', calculation: 'fixed', value: 30, order: 3 },
    { name: 'بدل أخرى', code: 'OTHER', type: 'earning', calculation: 'fixed', value: 0, order: 4 },
    { name: 'بدل العمل الإضافي', code: 'OT', type: 'earning', calculation: 'attendance', value: 0, order: 5 },
    { name: 'خصم التأخير', code: 'LATE', type: 'deduction', calculation: 'attendance', value: 0, order: 6 },
    { name: 'خصم الغياب', code: 'ABSENCE', type: 'deduction', calculation: 'attendance', value: 0, order: 7 },
    { name: 'خصم إجازة غير مدفوعة', code: 'UNPAID', type: 'deduction', calculation: 'attendance', value: 0, order: 8 },
    { name: 'التأمينات الاجتماعية', code: 'SSC', type: 'deduction', calculation: 'percent', percentOfBasic: 5.5, value: 0, order: 9 },
    { name: 'سلف واستقطاعات أخرى', code: 'ADVANCE', type: 'deduction', calculation: 'manual', value: 0, order: 10 },
  ];
  for (const c of components) {
    await db.salaryComponent.upsert({
      where: { code: c.code },
      update: {},
      create: c as never,
    });
  }

  // الوردية الافتراضية 08:00–17:00 بسماحية 10 دقائق
  let defaultShift = await db.shift.findFirst({ where: { name: 'الوردية الافتراضية' } });
  if (!defaultShift) {
    defaultShift = await db.shift.create({
      data: {
        name: 'الوردية الافتراضية',
        type: 'fixed',
        startTime: '08:00',
        endTime: '17:00',
        crossDay: false,
        graceMinutes: 10,
        earlyGraceMinutes: 10,
        otEnabled: true,
        otRoundMinutes: 15,
        halfDayMinutes: 240,
        workDays: '[0,1,2,3,4]',
        active: true,
      },
    });
  }
  const { saveSettings } = await import('@/lib/settings');
  const s = await db.setting.findUnique({ where: { key: 'defaultShiftId' } });
  if (!s) await saveSettings({ defaultShiftId: defaultShift.id });
}
