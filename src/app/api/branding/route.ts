import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ok, handle } from '@/lib/api';
import { getSettings } from '@/lib/settings';

/** هوية الشركة للمطبوعات (لأي مستخدم مسجل) — اللوجو يرجع data URL ليظهر في نوافذ الطباعة */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser(req);
    const s = await getSettings();
    let logo: string | null = null;
    if (s.companyLogoFileId) {
      const f = await db.fileUpload.findUnique({ where: { id: s.companyLogoFileId }, select: { data: true, mimeType: true } });
      if (f?.data && /^image\//.test(f.mimeType)) logo = `data:${f.mimeType};base64,${Buffer.from(f.data).toString('base64')}`;
    }
    return ok({
      companyName: s.companyName, companyNameEn: s.companyNameEn, address: s.companyAddress, phone: s.companyPhone,
      email: s.companyEmail, crNo: s.companyCrNo, style: s.reportStyle, color: s.reportColor, showLogo: s.reportShowLogo, logo,
    });
  });
}
