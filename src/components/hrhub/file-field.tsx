'use client';

// حقل رفع ملف داخل النماذج + فتح الملف المحفوظ (بالتوكن)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Paperclip, ExternalLink, X } from 'lucide-react';

/** فتح ملف محفوظ في تبويب جديد (يرسل التوكن) */
export async function openStoredFile(id: string) {
  const token = localStorage.getItem('sid');
  const res = await fetch(`/api/files/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { toast.error('تعذر فتح الملف'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const name = decodeURIComponent((res.headers.get('Content-Disposition') || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || 'file');
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  if (!/^(image\/|application\/pdf)/.test(blob.type)) a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function FileField({ value, onChange, ownerTag, employeeId }: {
  value: string; onChange: (id: string, name: string) => void; ownerTag?: string; employeeId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (ownerTag) form.append('ownerTag', ownerTag);
      if (employeeId) form.append('employeeId', employeeId);
      const token = localStorage.getItem('sid');
      const res = await fetch('/api/files/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'فشل الرفع');
      setName(file.name);
      onChange(d.id, file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الرفع');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border px-2">
      {value ? (
        <>
          <Paperclip className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="flex-1 truncate text-sm">{name || 'ملف مرفق'}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => openStoredFile(value)}><ExternalLink className="h-3.5 w-3.5" /> فتح</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => onChange('', '')}><X className="h-3.5 w-3.5" /></Button>
        </>
      ) : (
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4" /> {busy ? 'جاري الرفع...' : 'اختر ملف (PDF / Word / صورة) حتى 10 ميجا'}
          <input type="file" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}
