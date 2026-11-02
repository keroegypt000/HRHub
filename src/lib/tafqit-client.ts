// lib/tafqit-client.ts — نسخة عميل من التفقيط (نفس منطق الخادم)
const ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = [
  '', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة',
];

function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      if (o > 0) parts.push(`${ONES[o]} و${TENS[t]}`);
      else parts.push(TENS[t]);
    }
  }
  return parts.join(' و');
}

export function intToArabicWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'صفر';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const remainder = n % 1_000_000;
  const thousands = Math.floor(remainder / 1000);
  const units = remainder % 1000;
  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions <= 10) parts.push(`${ONES[millions]} ملايين`);
    else parts.push(`${threeDigits(millions)} مليون`);
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(`${ONES[thousands]} آلاف`);
    else parts.push(`${threeDigits(thousands)} ألف`);
  }
  if (units > 0) parts.push(threeDigits(units));
  return parts.join(' و');
}

export function tafqit(amount: number): string {
  const safe = Math.max(0, Math.round(Math.abs(amount) * 1000));
  const dinars = Math.floor(safe / 1000);
  const fils = safe % 1000;
  const dinarWords = intToArabicWords(dinars);
  let dinarPart: string;
  if (dinars === 1) dinarPart = 'دينار كويتي واحد';
  else if (dinars === 2) dinarPart = 'ديناران كويتيان';
  else if (dinars % 100 >= 3 && dinars % 100 <= 10) dinarPart = `${dinarWords} دنانير كويتية`;
  else dinarPart = `${dinarWords} دينار كويتي`;
  let filsPart = '';
  if (fils > 0) {
    const filsWords = intToArabicWords(fils);
    if (fils === 1) filsPart = 'وفلس واحد';
    else if (fils === 2) filsPart = 'وفلسان';
    else if (fils % 100 >= 3 && fils % 100 <= 10) filsPart = `و${filsWords} فلس`;
    else filsPart = `و${filsWords} فلسًا`;
  }
  return `${dinarPart} ${filsPart} فقط لا غير`.replace(/\s+/g, ' ').trim();
}
