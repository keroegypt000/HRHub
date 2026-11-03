// /api/requests/[id] — إجراء على طلب: اعتماد/رفض بالمستوى الحالي + إتمام السلسلة
// صاحب المستوى يقرر حتى لو كان حسابه «موظف» — والتحقق داخل actOnRequest
import { NextRequest } from 'next/server';
import { requireUser, handle, ok } from '@/lib/api';
import { actOnRequest } from '@/lib/request-flow';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string; comment?: string };
    return ok(await actOnRequest(user, id, body.action || '', body.comment));
  });
}
