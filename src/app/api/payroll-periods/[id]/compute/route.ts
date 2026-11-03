import { NextRequest } from 'next/server';
import { requireWrite, ok, fail, handle, HttpError } from '@/lib/api';
import { computePayrollPeriod } from '@/lib/payroll';
import { logAudit } from '@/lib/audit';

/** حساب / إعادة حساب قسائم الفترة — draft فقط (قاعدة 13) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWrite(req, 'payroll-periods');
    const { id } = await ctx.params;
    let result;
    try {
      result = await computePayrollPeriod(id);
    } catch (err) {
      // أخطاء قواعد العمل (فترة معتمدة/غير موجودة) ترجع 400 برسالتها العربية
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('أعد فتحها') || msg.includes('غير موجودة') || msg.includes('لم تنتهِ') || msg.includes('مستقبلية')) throw new HttpError(400, msg);
      throw err;
    }
    await logAudit({
      userId: user.id, action: 'compute', entity: 'payroll-period', entityId: id,
      description: `حساب قسائم الفترة (${result.employees} موظفًا — صافي إجمالي ${result.totalNet.toFixed(3)} د.ك)`,
      changes: result,
    });
    return ok(result);
  });
}
