import { NextRequest } from 'next/server';
import { requireRead, requireWrite, handle } from '@/lib/api';
import { crudList, crudCreate, CrudConfig } from '@/lib/crud';

export const cfg: CrudConfig = {
  model: 'formTemplate',
  entity: 'forms',
  label: 'نموذج',
  searchFields: ['title', 'category', 'fileName', 'notes'],
  orderBy: { createdAt: 'desc' },
  include: undefined,
  dateFields: [],
  validate: (data, mode) => {
    if (mode === 'create') {
      if (!data.title) return 'اكتب اسم النموذج';
      if (!data.fileId) return 'ارفع ملف النموذج';
    }
    return null;
  },
  describe: (row) => String(row.title),
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRead(req, 'forms');
    return crudList(req, null as never, cfg);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireWrite(req, 'forms');
    return crudCreate(req, user, cfg);
  });
}
