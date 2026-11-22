import { NextRequest } from 'next/server';
import { requireRead, ok, handle } from '@/lib/api';
import { ROLES, roleScreenLevel } from '@/lib/auth';
import { SCREENS } from '@/lib/screens';

/** المستوى الافتراضي لكل شاشة حسب كل دور — أساس محرر الصلاحيات */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'users');
    const out: Record<string, Record<string, string>> = {};
    for (const role of Object.keys(ROLES)) out[role] = Object.fromEntries(SCREENS.map((s) => [s.key, roleScreenLevel(role, s.key)]));
    return ok({ roles: ROLES, defaults: out });
  });
}
