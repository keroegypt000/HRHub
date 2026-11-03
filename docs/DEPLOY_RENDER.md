# نشر HRHub مجانًا: Render (الموقع) + Neon (قاعدة البيانات)

الإعداد كله جاهز في المستودع (`render.yaml`). المطلوب منك فقط إنشاء حسابين وربطهما — حوالي 10 دقائق.

> **ليه مش Vercel؟** السبب الأشهر لتوقف الموقع هو قاعدة Prisma Postgres المجانية: تتوقف عند انتهاء حصة العمليات
> (افتح `/api/health?quick=1` — لو ظهر `db.prisma.io` أو `P1001` فهذا هو السبب). Neon لا يحسب العمليات بنفس الطريقة.

---

## 1) قاعدة البيانات — Neon

1. ادخل **https://neon.tech** ← Sign up (يمكن الدخول بحساب GitHub).
2. **Create project**:
   - Name: `hrhub`
   - Postgres version: الافتراضي
   - Region: **AWS Europe Central (Frankfurt)** — الأقرب لـ Render فرانكفورت.
3. من صفحة المشروع ← **Connect** ← اختر:
   - **Connection pooling: OFF** (الرابط المباشر — مهم لأن البناء ينشئ الجداول)
   - انسخ الرابط، شكله:
     `postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

احتفظ بالرابط — هو `DATABASE_URL`.

## 2) الموقع — Render

1. ادخل **https://render.com** ← Sign up **بحساب GitHub** (keroegypt000).
2. من لوحة Render: **New + ← Blueprint**.
3. اختر المستودع **keroegypt000/HRHub** (اسمح لـ Render بالوصول إليه لو طلب).
4. Render سيقرأ `render.yaml` ويعرض خدمة `hrhub` — سيطلب قيمة واحدة:
   - **DATABASE_URL** ← الصق رابط Neon من الخطوة 1.
   - `APP_SECRET` يتولد تلقائيًا (لا تغيّره بعد ذلك — عليه تعتمد كلمات السر المحفوظة).
5. **Apply** — البناء الأول يأخذ 5–10 دقائق. تابع من تبويب **Logs**.
6. عند الانتهاء يظهر الرابط أعلى الصفحة، مثل: `https://hrhub-xxxx.onrender.com`

## 3) أول تشغيل

1. افتح الرابط ← تظهر **شاشة الإعداد الأول** ← أنشئ حساب المدير واسم الشركة (Al Fares Garden).
2. افتح `https://الرابط/api/health?quick=1` — يجب أن يظهر `"connected": true`.
3. من **الإعدادات**:
   - الإجازات ونهاية الخدمة: أساس المكافأة الافتراضي وحصة الإجازة.
   - البريد الإلكتروني: بيانات SMTP + رسالة تجربة + **رابط النظام** = رابط Render.
4. **المستخدمون**: أنشئ حسابات المعتمدين (Ashok، Mr. Talal ...) مع البريد.
5. **الطلبات والموافقات ← إعدادات الموافقات**: اضبط السلاسل لكل وحدة كما في ملف *Workflow SETUP*.
6. **الموظفون**: لكل موظف يوم الراحة، ثم تبويب **بوابة الموظف ← إنشاء حساب**.

## 4) جهاز البصمة (ZKTeco ADMS)

في الجهاز: **Comm ← Cloud Server Setting**
- Server address: `hrhub-xxxx.onrender.com` (بدون https)
- Port: `443` · HTTPS: **ON** (لو الجهاز يدعم) — وإلا استخدم BioTime للمزامنة.
- المسار `/iclock/` تلقائي.

> **تنبيه الخطة المجانية:** خدمة Render المجانية **تنام بعد 15 دقيقة بدون زيارات**، وأول طلب بعدها يأخذ ~30–50 ثانية.
> جهاز البصمة يحتفظ بالسجلات ويعيد إرسالها عند الاستيقاظ — لا تضيع البصمات، لكن تتأخر.
> لتشغيل دائم: خطة Render **Starter** (حوالي 7$ شهريًا) — من صفحة الخدمة ← Settings ← Instance Type.

## 5) نقل البيانات من قاعدة Prisma القديمة (اختياري)

لو عندك بيانات حقيقية على Vercel:

1. ادخل **console.prisma.io** ← مشروعك ← **Restore access for 24 hours** (مجاني).
2. من نفس الصفحة انسخ **Direct connection string** (يبدأ بـ `postgres://...@db.prisma.io:5432/...`).
3. على جهاز فيه أدوات PostgreSQL (`pg_dump` و `psql` — من https://www.postgresql.org/download/windows/):

```bash
pg_dump --no-owner --no-acl --data-only "رابط-Prisma-المباشر" > hrhub-data.sql
```

```bash
psql "رابط-Neon" -f hrhub-data.sql
```

افعل ذلك **بعد** أول نشر ناجح على Render (حتى تكون الجداول موجودة) و**قبل** إنشاء أي بيانات جديدة.

## مشاكل شائعة

| العرض | الحل |
|---|---|
| البناء يفشل عند `prisma db push` | تأكد أن `DATABASE_URL` هو الرابط **المباشر** (Pooling OFF) وينتهي بـ `?sslmode=require` |
| البناء يفشل بنفاد الذاكرة (Out of memory) | أعد المحاولة (Manual Deploy ← Clear build cache & deploy)؛ إن تكرر فالخطة Starter |
| الموقع بطيء أول مرة | طبيعي في الخطة المجانية (يستيقظ من النوم) |
| كلمة سر BioTime/SMTP لا تعمل بعد النقل | أعد إدخالها من الإعدادات — المفتاح الجديد `APP_SECRET` |
