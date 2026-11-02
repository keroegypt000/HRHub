import { NextRequest } from 'next/server';
import { destroySession, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { handle, ok } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getSessionUser(req);
    const token = req.cookies.get('sid')?.value || req.headers.get('authorization')?.slice(7);
    if (token) await destroySession(token);
    if (user) {
      await logAudit({ userId: user.id, action: 'logout', entity: 'user', entityId: user.id, description: `تسجيل خروج: ${user.name}` });
    }
    const res = ok({ loggedOut: true });
    res.cookies.set('sid', '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  });
}
