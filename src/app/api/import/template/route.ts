import { NextRequest } from 'next/server';
import { requireRead, handle, HttpError } from '@/lib/api';
import { TEMPLATES, templateBuffer } from '@/lib/excel';

/** تنزيل قالب Excel جاهز لكل كيان */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'import');
    const entity = new URL(req.url).searchParams.get('entity') || '';
    const tpl = TEMPLATES[entity];
    if (!tpl) throw new HttpError(404, 'قالب غير معروف');
    const buf = templateBuffer(tpl.columns, tpl.sheet);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="adms-template-${entity}.xlsx"`,
      },
    });
  });
}
