# 🧑‍💼 البرومت الكامل — إعادة بناء نظام HRHub بالكامل (HRMS بديل BioTime)

> **إزاي تستخدم الملف ده؟** انسخ المحتوى كله والصقه في أي أداة ذكاء اصطناعي (Claude / ChatGPT / Z.ai...) كأول رسالة، واطلب منه يبني المشروع خطوة بخطوة بنفس الترتيب الموجود في القسم الأخير. البرومت ده يوصف النظام 100%: كل جدول، كل صفحة، كل قاعدة عمل، كل ميزة.
>
> **مستقل تمامًا عن PropertyHub:** مستودع GitHub جديد باسم `hrhub` وقاعدة بيانات جديدة — بنفس الهيكل التقني ونمط التصميم فقط، وبلا أي مشاركة في الكود أو البيانات أو المفاتيح.

---

## 1) الهوية والهدف

ابنِ لي نظامًا متكاملًا لإدارة الموارد البشرية والحضور والرواتب باسم **HRHub**:

- **السوق المستهدف:** دولة الكويت (عملة **دينار كويتي KWD** بـ 3 خانات عشرية — 1000 فلس = 1 دينار — الرمز المعروض `د.ك`).
- **اللغة والاتجاه:** واجهة **عربية بالكامل RTL** (`<html lang="ar" dir="rtl">`)، كل التسميات والحالات والرسائل بالعربية، مع أرقام لاتينية.
- **المستخدمون:** مالك المكتب (مدير النظام)، فريق الموارد البشرية، المحاسب، المشرفون على الأقسام، ومشاهدون بقراءة فقط.
- **النطاق الوظيفي:** ملف موظف كامل بالصور، عقود عمل، ورديات وجدولة، سجل بصمة خام من أجهزة **ZKTeco** عبر الـ IP (نفس أسلوب BioTime)، حضور يومي محسوب آليًا، إجازات وعطلات، رواتب محسوبة من الحضور، تقارير شاملة، واستيراد وتصدير Excel.
- **الفلسفة:** المعالجة الآلية الكاملة — السجلة الخام لا تُعدل أبدًا، والحالة اليومية تُشتق منها بقواعد وردية معلنة، والراتب يُبنى من الحالة اليومية بمعادلات شفافة قابلة للتدقيق من أي محاسب.
- **الهوية المعروضة:** «HRHub — إدارة الموارد البشرية والحضور والرواتب» بشعار أيقونة موظف باللون الأخضر الزمردي (`icon.svg` + `logo.svg`).

## 2) التقنيات (Tech Stack)

| الطبقة | الاختيار |
|---|---|
| Framework | **Next.js 16 (App Router)** + **React 19** + TypeScript |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (كل مكونات Radix: Dialog, Select, Table, Badge, Card, Tabs...) |
| Database | **PostgreSQL** عبر **Prisma ORM** (Prisma Postgres المستضاف على Vercel) |
| Icons / Toasts | **lucide-react** + **sonner** |
| Auth | مخصص بدون مكتبات: scrypt + جلسات في قاعدة البيانات (Cookie HttpOnly + Bearer) |
| Excel | **SheetJS (xlsx)** للاستيراد والتصدير داخل المتصفح وفي السيرفر |
| التخزين | **Cloudflare R2** (متوافق S3 عبر @aws-sdk/client-s3) مع وضع احتياطي داخل قاعدة البيانات للصور والملفات |
| النشر | **Vercel** (نشر تلقائي بعد كل push على main) |

## 3) قاعدة البيانات — Prisma Schema كامل (22 جدولًا)

انسخ هذا الـ schema حرفيًا في `prisma/schema.prisma` ثم نفّذ `prisma db push`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ===== المصادقة والنظام =====
model User {
  id           String         @id @default(cuid())
  username     String         @unique
  name         String
  passwordHash String
  salt         String
  role         String         @default("viewer") // admin|hr|accountant|supervisor|viewer
  permissions  String?        // JSON صلاحيات دقيقة تتجاوز افتراضي الدور
  active       Boolean        @default(true)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  sessions     Session[]
  auditLogs    AuditLog[]
  restores     RestorePoint[]
}

model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String?
  action      String   // create|update|delete|login|sync|import|approve|pay
  entity      String
  entityId    String?
  changes     String?  // JSON before/after
  description String   // وصف عربي تلقائي
  createdAt   DateTime @default(now())
  user        User?    @relation(fields: [userId], references: [id])

  @@index([createdAt])
}

model RestorePoint {
  id          String   @id @default(cuid())
  userId      String?
  description String
  snapshot    String   // JSON لقطة للأقسام الأساسية
  createdAt   DateTime @default(now())
  user        User?    @relation(fields: [userId], references: [id])
}

model FileUpload {
  id         String    @id @default(cuid())
  fileName   String
  mimeType   String
  size       Int
  data       Bytes?    // وضع احتياطي داخل القاعدة
  r2Key      String?   // مفتاح Cloudflare R2
  ownerTag   String?   // employee_photo|contract_file|leave_attachment
  employeeId String?
  createdAt  DateTime  @default(now())
  createdBy  String?
  employee   Employee? @relation("EmpFiles", fields: [employeeId], references: [id])
  empPhoto   Employee? @relation("EmpPhoto")
}

model ImportLog {
  id          String   @id @default(cuid())
  entity      String
  fileName    String
  totalRows   Int
  successRows Int
  failedRows  Int
  errors      String?  // JSON أخطاء كل صف
  createdBy   String?
  createdAt   DateTime @default(now())
}

// ===== الهيكل التنظيمي والموظفون والعقود =====
model Department {
  id        String       @id @default(cuid())
  name      String
  notes     String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  parentId  String?
  parent    Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children  Department[] @relation("DeptTree")
  employees Employee[]
}

model Position {
  id        String     @id @default(cuid())
  name      String
  notes     String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  employees Employee[]
}

model Employee {
  id               String            @id @default(cuid())
  code             String            @unique // الرقم الوظيفي = pin الجهاز افتراضيًا
  name             String
  photoId          String?
  gender           String?
  nationality      String?
  civilId          String?           @unique // الرقم المدني
  passportNo       String?
  phone            String?
  email            String?
  address          String?
  birthDate        DateTime?
  maritalStatus    String?
  departmentId     String?
  positionId       String?
  hireDate         DateTime?
  basicSalary      Float             @default(0) // د.ك ثلاث خانات عشرية
  bankAccount      String?
  status           String            @default("active") // active|suspended|on_leave|terminated
  pin              String?           // معرف البصمة داخل الأجهزة
  notes            String?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  department       Department?       @relation(fields: [departmentId], references: [id])
  position         Position?         @relation(fields: [positionId], references: [id])
  photo            FileUpload?       @relation("EmpPhoto", fields: [photoId], references: [id])
  contracts        Contract[]
  attendanceLogs   AttendanceLog[]
  dailyAttendance  DailyAttendance[]
  shiftAssignments ShiftAssignment[]
  leaveRequests    LeaveRequest[]
  payslips         Payslip[]
  files            FileUpload[]      @relation("EmpFiles")

  @@index([name])
  @@index([status])
}

model Contract {
  id                 String     @id @default(cuid())
  employeeId         String
  contractNo         String     @unique
  type               String     @default("full_time") // full_time|part_time|temporary|consultant
  startDate          DateTime
  endDate            DateTime?
  durationMonths     Int?
  basicSalary        Float
  housingAllowance   Float      @default(0)
  transportAllowance Float      @default(0)
  otherAllowance     Float      @default(0)
  hoursPerDay        Float      @default(8)
  daysPerWeek        Int        @default(5)
  status             String     @default("active") // active|expired|terminated|renewed
  renewalOfId        String?
  terminatedAt       DateTime?
  terminationReason  String?
  notes              String?
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt
  employee           Employee   @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  renewalOf          Contract?  @relation("Renewals", fields: [renewalOfId], references: [id])
  renewals           Contract[] @relation("Renewals")
}

// ===== الأجهزة والبصمة والورديات =====
model Device {
  id             String          @id @default(cuid())
  sn             String          @unique // الرقم التسلسلي للجهاز
  name           String
  model          String?
  location       String?
  ipAddress      String?
  port           Int?
  lastSeenAt     DateTime?
  lastIp         String?
  status         String          @default("unknown") // online|offline|unknown
  enabled        Boolean         @default(true)
  pushVersion    String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  attendanceLogs AttendanceLog[]
}

model AttendanceLog {
  id         String    @id @default(cuid())
  sn         String
  pin        String    // معرف المستخدم داخل الجهاز
  employeeId String?
  punchTime  DateTime
  status     Int       @default(0) // 0 دخول|1 خروج|2 خروج استراحة|3 عودة|4 دخول إضافي|5 خروج إضافي
  verify     Int       @default(1) // 1 بصمة|3 كلمة سر|4 بطاقة|15 وجه
  workCode   String?
  source     String    @default("adms") // adms|biotime|excel|manual
  createdAt  DateTime  @default(now())
  device     Device    @relation(fields: [sn], references: [sn], onDelete: Cascade)
  employee   Employee? @relation(fields: [employeeId], references: [id])

  @@unique([sn, pin, punchTime, status])
  @@index([punchTime])
  @@index([employeeId])
}

model Shift {
  id                String            @id @default(cuid())
  name              String
  type              String            @default("fixed") // fixed|flexible|auto
  startTime         String            // "08:00"
  endTime           String            // "17:00"
  crossDay          Boolean           @default(false) // وردية ليلية تعبر منتصف الليل
  graceMinutes      Int               @default(10)
  earlyGraceMinutes Int               @default(10)
  otEnabled         Boolean           @default(true)
  otRoundMinutes    Int               @default(15)
  halfDayMinutes    Int               @default(240)
  workDays          String            @default("[0,1,2,3,4]") // 0=الأحد
  active            Boolean           @default(true)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  assignments       ShiftAssignment[]
  dailyAttendance   DailyAttendance[]
}

model ShiftAssignment {
  id         String    @id @default(cuid())
  employeeId String
  shiftId    String
  fromDate   DateTime
  toDate     DateTime?
  createdAt  DateTime  @default(now())
  employee   Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift      Shift     @relation(fields: [shiftId], references: [id], onDelete: Cascade)

  @@index([employeeId, fromDate])
}

model DailyAttendance {
  id            String    @id @default(cuid())
  employeeId    String
  date          DateTime  @db.Date
  shiftId       String?
  firstIn       DateTime?
  lastOut       DateTime?
  workedMinutes Int       @default(0)
  lateMinutes   Int       @default(0)
  earlyMinutes  Int       @default(0)
  otMinutes     Int       @default(0)
  status        String    @default("absent") // present|late|half_day|absent|leave|holiday|weekend|missed_punch
  note          String?
  processedAt   DateTime  @default(now())
  employee      Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift         Shift?    @relation(fields: [shiftId], references: [id])

  @@unique([employeeId, date])
  @@index([date])
}

// ===== الإجازات والعطلات =====
model LeaveType {
  id        String         @id @default(cuid())
  name      String
  code      String         @unique
  paid      Boolean        @default(true)
  quotaDays Float?
  color     String?
  active    Boolean        @default(true)
  requests  LeaveRequest[]
}

model LeaveRequest {
  id          String    @id @default(cuid())
  employeeId  String
  leaveTypeId String
  fromDate    DateTime
  toDate      DateTime
  days        Float
  reason      String?
  status      String    @default("pending") // pending|approved|rejected|cancelled
  reviewedBy  String?
  reviewedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  employee    Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  leaveType   LeaveType @relation(fields: [leaveTypeId], references: [id])

  @@index([fromDate])
}

model Holiday {
  id        String    @id @default(cuid())
  name      String
  date      DateTime  @db.Date
  endDate   DateTime? @db.Date // نطاق عطلة (مثل عيد الفطر)
  recurring Boolean   @default(false)
  createdAt DateTime  @default(now())
}

// ===== الرواتب =====
model SalaryComponent {
  id             String        @id @default(cuid())
  name           String
  code           String        @unique
  type           String        // earning|deduction
  calculation    String        @default("fixed") // fixed|attendance|percent|manual
  value          Float         @default(0)
  percentOfBasic Float?
  active         Boolean       @default(true)
  order          Int           @default(0)
  items          PayslipItem[]
}

model PayrollPeriod {
  id         String    @id @default(cuid())
  name       String    @unique // "2026-01"
  startDate  DateTime
  endDate    DateTime
  status     String    @default("draft") // draft|computed|approved|paid
  computedAt DateTime?
  approvedBy String?
  approvedAt DateTime?
  paidAt     DateTime?
  notes      String?
  createdAt  DateTime  @default(now())
  payslips   Payslip[]
}

model Payslip {
  id               String         @id @default(cuid())
  periodId         String
  employeeId       String
  basicSalary      Float
  totalEarnings    Float
  totalDeductions  Float
  netPay           Float
  workedDays       Float          @default(0)
  absenceDays      Float          @default(0)
  otHours          Float          @default(0)
  otAmount         Float          @default(0)
  lateMinutes      Int            @default(0)
  lateDeduction    Float          @default(0)
  absenceDeduction Float          @default(0)
  status           String         @default("draft")
  notes            String?
  createdAt        DateTime       @default(now())
  period           PayrollPeriod  @relation(fields: [periodId], references: [id], onDelete: Cascade)
  employee         Employee       @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  items            PayslipItem[]

  @@unique([periodId, employeeId])
}

model PayslipItem {
  id          String           @id @default(cuid())
  payslipId   String
  componentId String?
  name        String
  type        String           // earning|deduction
  amount      Float
  note        String?
  payslip     Payslip          @relation(fields: [payslipId], references: [id], onDelete: Cascade)
  component   SalaryComponent? @relation(fields: [componentId], references: [id])
}
```

## 4) المصادقة والأدوار والصلاحيات

### 4.1 المصادقة
- **تسجيل دخول** باسم مستخدم وكلمة سر. التشفير: `crypto.scryptSync(password, salt, 64)` مع salt عشوائي 16 بايت، والمقارنة بـ `crypto.timingSafeEqual` — مطابق تمامًا لمعايير PropertyHub.
- **الجلسات:** token عشوائي 32 بايت base64url يُخزن في جدول `Session` مع انتهاء بعد **12 ساعة**، ويُجدد تلقائيًا عند تجاوز نصف المدة.
- **إرسال التوكن بطريقتين:** كوكي `sid` بـ `HttpOnly; SameSite=Lax` **و** ترويسة `Authorization: Bearer <token>` (الواجهة تخزنه في localStorage تحت المفتاح `sid`).
- **Rate limiting** على تسجيل الدخول: 5 محاولات فاشلة → قفل 10 دقائق (in-memory Map).
- **شاشة إعداد أول مرة:** عند عدم وجود أي مستخدمين تظهر شاشة إعداد لإنشاء حساب المدير الأول (`GET /api/setup-needed` و `POST /api/setup`).
- عند فشل أي طلب بـ 401 تُنظف الجلسة محليًا وتظهر شاشة الدخول (مع تجاهل أخطاء 401 خلال أول 3 ثوانٍ بعد الدخول لتجنب سباق التحقق).

### 4.2 الأدوار (خمسة)
| الدور | الكود | الصلاحيات |
|---|---|---|
| مدير النظام | `admin` | كل شيء — بما فيه المستخدمون والتدقيق والاستعادة والإعدادات الحساسة |
| موارد بشرية | `hr` | الكتابة في: موظفون، أقسام ومسميات، عقود، ورديات وتوزيعها، إجازات وعطلات، أجهزة، ملفات، اعتماد الحضور اليومي |
| محاسب | `accountant` | الكتابة في: فترات الرواتب (إنشاء/حساب/اعتماد/صرف)، مكونات الراتب؛ قراءة كاملة للحضور والتقارير |
| مشرف | `supervisor` | طلبات إجازة لفريقه، قراءة حضور فريقه وتقاريره، تسجيل سجلات يدوية بموافقة HR |
| مشاهد | `viewer` | قراءة فقط لكل ما يسمح به دوره دون أي كتابة |

### 4.3 الصلاحيات الدقيقة
- كل مستخدم يمكن أن يملك حقل `permissions` JSON اختياريًا بصيغة `{"payroll": true, "devices": false, ...}` يتجاوز الافتراضي الخاص بدوره.
- **التحقق يتم في السيرفر داخل كل مسار API** (دالتا `canWrite(role, entity)` و `canRead(role, entity)`) وليس في الواجهة فقط.
- **الأقسام الإدارية** (سجل التدقيق، نقاط الاستعادة، المستخدمون، الإعدادات الحساسة) **تُخفى من القائمة الجانبية** لغير المديرين **وتُحمى في الـ API أيضًا** — الإخفاء وحده لا يكفي.
- كل عملية كتابة تُسجَّل في `AuditLog` مع (المستخدم، الإجراء، الكيان، المعرّف، التغييرات JSON، وصف عربي تلقائي).

## 5) محرك البصمة ZKTeco (أهم ميزة في النظام)

ملف `src/lib/zk/*` — قلب النظام الذي يجعله بديلًا حقيقيًا لـ BioTime. يدعم المحرك **ثلاثة أوضاع** لجلب السجلات، تعمل جنبًا إلى جنب وتلتقي جميعها في جدول `AttendanceLog` الخام الموحد.

### 5.1 الوضع الأول — ADMS Push مباشر (الافتراضي)
النظام يعمل كخادم ADMS (Attendance Device Management Server) يستقبل اتصالات الأجهزة مباشرة. يُضبط الجهاز من قائمته: **Comm → ADMS: Server IP = دومين النظام، Port = 80، Server Path = `/iclock/`**. بعدها يبدأ الجهاز بالدفع التلقائي لكل بصمة جديدة خلال ثوانٍ، مع رفع السجلات غير المتصلة (Offline Records) عند عودة الاتصال.

- **Handshake:** `GET /iclock/cdata?SN=<serial>&pushver=...&options=all` — يرد الخادم بـ `OK` وسلسلة إعدادات قصيرة (مثل `VERIFY=1,INFORM=0`) ويُنشئ/يحدّث سجل الجهاز في جدول `Device`.
- **Keep-alive:** طلبات دورية كل نحو 30 ثانية — يُحدَّث `lastSeenAt` و`lastIp` وتُعاد حالة `online` فورًا؛ أي جهاز لم يظهر خلال 90 ثانية يُعد `offline` في لوحة التحكم.
- **السجلات:** `POST /iclock/cdata?SN=...&table=ATTLOG&stamp=...` — كل سطر سجلة بصيغة مفصولة بفواصل جدوبة أو مشفرة Hex (تُفك تلقائيًا): `pin\tpunchTime\tstatus\tverify\tworkCode`.
- **المستخدمون:** `table=USERINFO` و `table=FP` — لمزامنة الأسماء من الجهاز وربط الـ pin بموظف تلقائيًا إن أمكن.
- **أوامر عكسية:** الاستجابة للطلب تحمل أوامر بسيطة (مثل `CHECKIN`) تُدار من صفحة الأجهزة لإجبار الجهاز على إعادة رفع البيانات.

| القيمة | الحالة status | القيمة | طريقة التحقق verify |
|---|---|---|---|
| 0 | دخول Check-in | 1 | بصمة الإصبع Fingerprint |
| 1 | خروج Check-out | 3 | كلمة سر Password |
| 2 | خروج لاستراحة Break-out | 4 | بطاقة Card |
| 3 | عودة من الاستراحة Break-in | 15 | وجه Face |
| 4 | دخول عمل إضافي OT-in | 0 | غير محدد |
| 5 | خروج من عمل إضافي OT-out | | |

### 5.2 الوضع الثاني — سحب من خادم BioTime قائم (REST API)
إذا كان العميل يشغّل BioTime 8.5 أو 9.5 على خادم محلي، يتصل HRHub به عبر واجهته الرسمية ويجرّ كل شيء دون مساس بالأجهزة نفسها. تُخزن بيانات الاعتماد في الإعدادات (مدير فقط) وتُنفذ المزامنة يدويًا أو تلقائيًا كل 15 دقيقة:

```http
POST /jwt-api-token-auth/          { username, password }  ->  { token }
Authorization: JWT <token>

GET /api/personnel/employees/?page_size=1000        الموظفون + الأقسام + المسميات
GET /api/area/?page_size=1000                       المناطق / الفروع
GET /api/device/?page_size=1000                     الأجهزة وحالتها
GET /api/transaction/?start_time=2026-01-01 00:00:00
                    &end_time=2026-01-31 23:59:59
                    &page_size=1000&page=1          سجلات الحضور
```

- يتعامل المحرك مع الاختلافات الطفيفة في أسماء الحقول بين الإصدارات بمرونة (mapping table)، ويدعم الترقيم (pagination) حتى استنفاد كل النتائج.
- المزامنة تُسجل في `AuditLog` (action=`sync`) مع عدد السجلات الجديدة والمكررة المتجاهلة.

### 5.3 الوضع الثالث — استيراد Excel يدوي
لأي حالة استثنائية أو انتقال أولي من نظام قديم: قالب Excel جاهز (الأعمدة: الرقم الوظيفي، الرقم التسلسلي للجهاز SN، وقت السجلة، الحالة، طريقة التحقق) يُرفع من قسم الاستيراد، وتُنفذ القراءة كاملة داخل transaction مع تقرير نجاح/فشل لكل صف. يُميَّز بالمصير `source=excel`.

### 5.4 خط معالجة الحضور (Attendance Pipeline)
ملف `src/lib/attendance.ts` — يحوّل السجلات الخام إلى حالة يومية نهائية في جدول `DailyAttendance` وفق القواعد الآتية، وتُعاد المعالجة تلقائيًا عند وصول أي سجلة جديدة تؤثر في اليوم، أو يدويًا بزر «إعادة معالجة»:

1. **De-duplication:** قيد فريد `(sn, pin, punchTime, status)` يمنع تكرار السجلة مهما أرسلها الجهاز أو جاءت من أكثر من مصدر.
2. **ربط الموظف:** البحث بـ `pin` أولًا ثم بـ `code`؛ إن لم يوجد تطابق يبقى السجل في شاشة «سجلات غير معروفة» لربطه يدويًا أو بمطابقة جماعية من Excel.
3. **تحديد الوردية:** آخر توزيعة `ShiftAssignment` سارية لتاريخ اليوم، وإلا الوردية الافتراضية من الإعدادات.
4. **أولوية تغطية اليوم:** عطلة رسمية Holiday ← إجازة معتمدة Leave ← يوم راحة أسبوعية (خارج `workDays` للوردية) ← يوم عمل عادي.
5. **الحساب:** `firstIn` أقرب سجلة و`lastOut` أبعد سجلة؛ `workedMinutes = lastOut − firstIn` — سجل واحد فقط (أقل من 10 دقائق فرق) يعني حالة `missed_punch`.
6. **التأخير:** `max(0, firstIn − (بداية الوردية + graceMinutes))` بالدقائق — ولا يُحسب في يوم راحة أو عطلة.
7. **الخروج المبكر:** `max(0, (نهاية الوردية − earlyGraceMinutes) − lastOut)` بالدقائق، مع تجاوز منتصف الليل تلقائيًا للورديات ذات `crossDay`.
8. **الإضافي:** المدة بعد نهاية الوردية تُقرَّب لأقرب `otRoundMinutes` ولا تُحتسب إلا إذا كانت `otEnabled` مفعلة بالوردية، مع دعم حالات OT-in/OT-out الصادرة من الجهاز.
9. **الحالات النهائية:** `present` أو `late` أو `half_day` (عتبة `halfDayMinutes`) أو `absent` (يوم عمل بلا سجلات) أو `missed_punch` أو `leave` أو `holiday` أو `weekend`.
10. **الشفافية:** كل سطر يومي يعرض سجلاته المصدرية عند فتحه — لا رقم بلا مصدر، وهذا أساس ثقة المحاسب بالتقارير.

### 5.5 مراقبة الأجهزة
- صفحة الأجهزة تعرض: الحالة الحية (online/offline)، آخر ظهور وآخر IP، عدد سجلات اليوم، إصدار البروتوكول `pushver`، وزر اختبار اتصال.
- جهاز جديد يرسل بصماته قبل تسجيله يُقبل أو يُرفض حسب إعداد «قبول الأجهزة تلقائيًا» (الافتراضي: قبول مع تنبيه في لوحة التحكم لتوثيقه).
- انقطاع أي جهاز يتجاوز 10 دقائق يرفع تنبيهًا برتقاليًا في لوحة التحكم حتى عودته.

## 6) محرك الرواتب (Payroll Engine)

ملف `src/lib/payroll.ts` — محرك حساب شفاف بالكامل يبني رواتب الشهر من الحضور اليومي المعتمد والأنواع والعقود، بنفس فلسفة محرك القيود في PropertyHub: معادلات معلنة، تقريب موحد، وتقرير مصدر لكل رقم في قسيمة الراتب.

### 6.1 مكونات الراتب (SalaryComponent)
| الحقل | القيم | الشرح |
|---|---|---|
| `type` | `earning` / `deduction` | مكوّن دخل (بدل) أو استقطاع |
| `calculation` | `fixed` / `attendance` / `percent` / `manual` | قيمة ثابتة، أو مشتقة من الحضور، أو نسبة من الأساسي، أو إدخال يدوي لكل موظف |
| `value` / `percentOfBasic` | رقم | المبلغ الثابت أو النسبة (مثل بدل سكن 30% من الأساسي) |
| `order` | رقم | ترتيب الظهور في القسيمة |

المكونات الافتراضية المنشأة عند أول تشغيل: الراتب الأساسي (من العقد)، بدل سكن، بدل مواصلات، بدل أخرى، إضافي (attendance)، خصم تأخير (attendance)، خصم غياب (attendance)، خصم إجازة غير مدفوعة (attendance)، سلف أو استقطاعات أخرى (manual).

### 6.2 معادلات الحساب الأساسية (نفذها حرفيًا)
| البند | المعادلة الافتراضية | ملاحظات |
|---|---|---|
| أجر الساعة | `basic ÷ 26 ÷ hoursPerDay` | 26 يوم عمل القاعدة الكويتية — قابل للتعديل من الإعدادات |
| العمل الإضافي | `أجر الساعة × 1.25` لكل ساعة إضافي | × 1.5 في العطل والراحة الأسبوعية — المضاعفات قابلة للتعديل |
| خصم التأخير | `أجر الدقيقة × دقائق التأخير` | أجر الدقيقة = أجر الساعة ÷ 60 — أو نسبة من اليوم حسب الإعداد |
| خصم الغياب | `(basic ÷ 26) × أيام الغياب` | يوم عمل كامل بلا سجلات وبلا إجازة معتمدة |
| إجازة غير مدفوعة | `(basic ÷ 26) × أيام الإجازة` | لأنواع الإجازات ذات `paid = false` |
| تأمينات اجتماعية | مواطن: 5.5% موظف + 11.5% جهة عمل — مقيم: 2.5% جهة عمل | نسب قابلة للتعديل؛ نصيب الموظف يُخصم من الصافي |
| صافي الراتب | الأساسي + المكملات − الاستقطاعات | تقريب ثلاث خانات في كل خطوة: `Math.round(n*1000)/1000` |

### 6.3 دورة حياة فترة الرواتب
- **draft:** تُنشأ الفترة (مثال: `2026-01`) ويمكن حساب القسائم وإعادة الحساب بلا قيود — إعادة الحساب تحذف القسائم وتعيد بناءها.
- **computed:** تم الحساب الأولي؛ تظهر القسائم للمراجعة مع تفصيل أيام العمل والغياب والتأخير والإضافي لكل موظف.
- **approved:** اعتماد المدير أو المحاسب — تُقفل الفترة نهائيًا ولا يتأثر بأي تعديل لاحق على الحضور؛ إعادة الفتح تُسجل في التدقيق وتتطلب مديرًا.
- **paid:** تسجيل الصرف وتاريخه — مع تصدير ملف بنك (Excel/CSV: الرقم الوظيفي، الاسم، رقم الحساب، الصافي) جاهز للرفع على نظام البنك.

### 6.4 قسيمة الراتب المطبوعة
- قالب مطبوعة عربي أنيق من `print-docs.tsx` (نفس نظام سندات PropertyHub): بيانات الموظف والفترة، جدول المكملات والاستقطاعات، الصافي، خانات توقيع الموظف والمسؤول والختم.
- **التفقيط العربي** عبر `lib/tafqit.ts`: «ألف دينار كويتي وخمسمئة فلس فقط لا غير» — يُطبق على الصافي في كل القسائم.
- تصدير PDF للقسيمة الواحدة أو دفعة كاملة (قسيمة لكل موظف) عبر الطباعة إلى PDF من المتصفح.

## 7) أقسام النظام (17 قسمًا في القائمة الجانبية)

التنقل عبر `Section` state واحدة في مكوّن رئيسي واحد (لا صفحات منفصلة) — عند تغيير القسم تُحمَّل بياناته فقط، نفس نمط PropertyHub. الأقسام الإدارية لا تظهر إلا للمدير، وقسم الرواتب يظهر للمحاسب والمدير.

| # | القسم (المسار) | الوصف الوظيفي |
|---|---|---|
| 1 | لوحة التحكم `dashboard` | بطاقات KPI: حاضرون اليوم، متأخرون، غائبون، في إجازة، أجهزة متصلة؛ آخر 10 سجلات بصمة حية مع اسم الموظف وصورته؛ شارت اتجاه الحضور لآخر 30 يومًا |
| 2 | الموظفون `employees` | جدول وبطاقات بالصور، بحث وفلترة بالقسم/الحالة/النوعية؛ ملف الموظف الكامل بتبويبات: بيانات، عقود، حضور، إجازات، رواتب، ملفات |
| 3 | الأقسام والمسميات `departments` | شجرة أقسام هرمية + مسميات وظيفية مع عدد الموظفين في كل منها |
| 4 | العقود `contracts` | أنواع عقود ومدد وبدلات؛ تجديد بسلسلة مرتبطة؛ إنهاء بسبب موثق؛ تنبيه انتهاء قبل 30/60/90 يومًا في لوحة التحكم |
| 5 | الورديات `shifts` | إنشاء ورديات ثابتة/مرنة/ليلية تعبر منتصف الليل؛ سماحيات وتقريب إضافي؛ توزيع جماعي على موظفين أو قسم كامل بفترة سريان |
| 6 | سجل البصمة `attendance-logs` | كل السجلات الخام بفلاتر (فترة، موظف، جهاز، مصدر)؛ شاشة «سجلات غير معروفة» لربط الـ pin بموظف |
| 7 | الحضور اليومي `daily-attendance` | النتيجة المحسوبة لكل موظف/يوم (حالة، دخول، خروج، تأخير، مبكر، إضافي) مع عرض السجلات المصدرية وزر إعادة معالجة فترة |
| 8 | الإجازات `leaves` | طلبات إجازة بسير موافقات (بانتظار/معتمدة/مرفوضة)؛ أرصدة تلقائية من الحصة السنوية للنوع؛ تأثير فوري على الحضور المحسوب |
| 9 | العطلات الرسمية `holidays` | عطلات فردية أو نطاقات (عيد الفطر مثلاً) مع تكرار سنوي اختياري — تدخل في أولوية تغطية اليوم |
| 10 | الأجهزة `devices` | إضافة/تعطيل/توثيق أجهزة ZKTeco؛ الحالة الحية وآخر ظهور وآخر IP؛ إرشادات ضبط ADMS خطوة بخطوة لكل جهاز |
| 11 | الرواتب `payroll` | فترات الرواتب بمسارها الكامل: إنشاء، حساب، مراجعة قسائم، اعتماد، صرف، تصدير بنك — مع منع أي تعديل بعد الاعتماد |
| 12 | مكونات الراتب `salary-components` | إدارة المكملات والاستقطاعات وطريقة حساب كل منها وترتيبها في القسيمة |
| 13 | التقارير `reports` | ستة تقارير: الحضور اليومي، الملخص الشهري، التأخير والخروج المبكر، العمل الإضافي، الغياب، رصيد الإجازات — بفلاتر وتصدير Excel وطباعة |
| 14 | الاستيراد والتصدير `import` | قوالب Excel جاهزة لكل كيان؛ رفع مع تقرير نجاح/فشل لكل صف؛ تصدير أي قسم بفلاتره الحالية |
| 15 | سجل التدقيق `audit` (مدير) | كل كتابة بوصفها العربي والمستخدم والتغييرات — بحث وفلترة وحد صفحات |
| 16 | المستخدمون `users` (مدير) | إنشاء حسابات، أدوار، صلاحيات دقيقة JSON، تفعيل/إيقاف، تصفير كلمة السر |
| 17 | الإعدادات `settings` | عام (اسم الجهة والشعار)، معادلات وقيم (26 يوم، مضاعفات إضافي، نسب تأمينات)، إعدادات ADMS ومزامنة BioTime، نقاط الاستعادة، مسح البيانات التجريبية للمدير فقط |

## 8) الاستيراد والتصدير Excel (نظام كامل)

- زر **تصدير** في كل قسم ينزّل ملف `.xlsx` ببيانات القسم الحالية مع تطبيق الفلاتر نفسها — ولوحة التقارير تصدّر نتائج أي تقرير.
- زر **استيراد** يقرأ الملف في المتصفح عبر SheetJS ويرسله إلى نقطة bulk API تنفّذ الإنشاء الجماعي داخل transaction واحدة، مع تقرير نتائج لكل صف (نجح / فشل وسببه بالعربية) يظهر فورًا ويُحفظ في `ImportLog`.
- قوالب جاهزة للتحميل لكل كيان: الموظفون (مع أعمدة القسم والمسمى بالاسم وإيجادها أو إنشائها تلقائيًا)، الأجهزة، الورديات، العطلات، سجل البصمة، مكونات الراتب.
- الاستيراد لا يفسد القائم: الصفوف المتطابقة (نفس الكود أو الرقم المدني) تُحدّث لا تُكرر، والصف الفاشل لا يوقف غيره.
- ملفات الموظفين الضخمة (1000 صف وأكثر) تُعالج على دفعات داخل السيرفر مع شريط تقدم في الواجهة.

## 9) المستندات المطبوعة (نظام print-docs)

نفس مبادئ نظام سندات PropertyHub: قالب موحّد `voucherDocHtml(spec)` يولّد HTML للطباعة بهوية HRHub، مع ترقيم مستندات آلي وتفقيط عربي وتوقيعات. المستندات في النسخة الأولى:

1. قسيمة راتب فردية بدفعة كاملة (قسيمة لكل موظف في الفترة).
2. شهادة راتب موجهة (إلى من يعنيه / بنك) بتفاصيل مكونات الراتب للفترة أو آخر ثلاث فترات.
3. خطاب تعريف موظف بتاريخ اليوم ورقم مرجعي فريد.
4. كشف حضور ورواتب شهري ملخّص بجدول الموظفين والتوقيعات والختم.
5. إشعار إنهاء أو تجديد عقد ببيانات العقد القديم والجديد.

## 10) الأمان (ملخص تنفيذي)

- كلمات السر scrypt مع salt لكل مستخدم، ومقارنات timing-safe، ولا تخزين نصي صريح لأي سر في أي مكان.
- جلسات بخمد زمني (12 ساعة) قابلة للإبطال من صفحة المستخدمين؛ تسجيل خروج ينظف الجلسة من القاعدة.
- تحقق صلاحيات في السيرفر لكل مسار، ورفض مع 403 وسجل تدقيق لكل محاولة كتابة مرفوضة من دور غير مخول.
- نقاط ADMS `/iclock/*` بلا مصادقة مستخدم بطبيعة البروتوكول، لكنها تتحقق من `SN` المسجل وتُهمل أي جهاز غير معروف عند إيقاف «القبول التلقائي»، مع rate limit على المسار لمنع الإغراق.
- نقاط استعادة تلقائية بعد كل كتابة من الواجهة (snapshot JSON للأقسام الأساسية) قابلة للاستعادة من قبل المدير — نفس فلسفة PropertyHub.
- بيانات اتصال BioTime والتخزين السحابي تُخزن مشفرة في الإعدادات ولا تعود للواجهة إلا مخفية.

## 11) نظام الألوان والتصميم (UI/UX)

### 11.1 الهوية البصرية
- **اللون الرئيسي:** أخضر زمردي `#1F8A70` (تمييز واضح عن البرتقالي في PropertyHub) — للعناوين والأزرار الرئيسية وحالات النجاح والحضور.
- **دلالات الحالة:** أخضر = حاضر، كهرماني = متأخر أو بانتظار، أحمر = غائب أو فشل، أزرق = إجازة، رمادي = يوم راحة أو عطلة، بنفسجي = عمل إضافي.
- **الخطوط:** خط النظام الحالي (system-ui stack) واضح بالعربية بأحجام 12–14px للجداول و16px للنصوص، وأرقام لاتينية موحدة `tabular-nums` في كل المبالغ والتقارير.

### 11.2 التخطيط والتجاوب
- قائمة جانبية ثابتة على الديسكتوب (تبدأ من اليمين RTL) تتحول إلى درج سفلي على الموبايل، مع عنوان القسم الحالي وإجراءاته السريعة أعلى كل شاشة.
- كل قسم بحالتين: جدول كامل على الديسكتوب، وبطاقات مكدسة على الموبايل — موحد عبر مكوّن `DataTable` مشترك.
- لوحة التحكم تنتهي بـ «سجل حي» يعرض آخر السجلات الواردة من الأجهزة فور ورودها (polling كل 10 ثوانٍ) لإحساس BioTime الحي.
- حالات تحميل Skeleton، رسائل sonner بالعربية، ورفع الصور مع ضغط داخل المتصفح قبل الإرسال.

## 12) خريطة نقاط الـ API (كلها تتحقق من المصادقة والصلاحيات)

```http
POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me | POST /api/auth/password
GET  /api/setup-needed | POST /api/setup

GET/POST  /api/employees            | PUT/DELETE /api/employees/[id]
POST      /api/employees/[id]/photo            (upload photo)
GET/POST  /api/departments         | PUT/DELETE /api/departments/[id]
GET/POST  /api/positions           | PUT/DELETE /api/positions/[id]
GET/POST  /api/contracts           | PUT/DELETE /api/contracts/[id]   (+ overlap check)
GET/POST  /api/shifts              | PUT/DELETE /api/shifts/[id]
GET/POST  /api/shift-assignments   | DELETE /api/shift-assignments/[id]
GET/POST  /api/leave-types         | PUT/DELETE /api/leave-types/[id]
GET/POST  /api/leaves              | PATCH /api/leaves/[id]           (approve/reject)
GET/POST  /api/holidays            | PUT/DELETE /api/holidays/[id]
GET/POST  /api/devices             | PUT/DELETE /api/devices/[id]
POST      /api/devices/[id]/test                (device ping)
GET/POST  /api/salary-components   | PUT/DELETE /api/salary-components/[id]
GET/POST  /api/payroll-periods     | PUT/DELETE /api/payroll-periods/[id]
POST      /api/payroll-periods/[id]/compute     (build / recompute payslips)
POST      /api/payroll-periods/[id]/approve
POST      /api/payroll-periods/[id]/pay
GET       /api/payslips?periodId=&employeeId=
GET       /api/payslips/[id] | GET /api/payslips/[id]/print   (HTML print doc)

GET/POST  /iclock/cdata?SN=...                  (ADMS listener: handshake,
                                                keep-alive, ATTLOG, USERINFO)
GET/POST  /iclock/ping?SN=...
POST      /api/biotime/sync                     (pull from BioTime server)
POST      /api/attendance/recompute?from=&to=&employeeId=
GET       /api/attendance-logs?from=&to=&employeeId=&deviceId=&page=
GET       /api/daily-attendance?from=&to=&departmentId=&status=

GET       /api/reports/daily | /api/reports/monthly | /api/reports/late
GET       /api/reports/overtime | /api/reports/absence | /api/reports/leaves

POST      /api/import/excel?entity=             (bulk inside transaction)
GET       /api/import/template?entity=          (download template)
GET       /api/export?entity=&from=&to=         (export with current filters)

GET/POST  /api/users | PATCH /api/users/[id]    (role/permissions/password/active)
GET       /api/audit?limit=100
GET/POST  /api/restore | POST /api/restore/[id]
POST      /api/files/upload | GET/DELETE /api/files/[id]
```

**قواعد عامة لكل المسارات:** أخطاء عربية واضحة بأكواد صحيحة (401 غير مصرح / 403 ليست لديك صلاحية / 400 تحقق من البيانات)، كل كتابة تُسجَّل AuditLog، كل كتابة ناجحة تنشئ نقطة استعادة تلقائية من الواجهة.

## 13) قواعد العمل الجوهرية (Business Rules) — انسخها حرفيًا

1. **العملة دينار كويتي بثلاث خانات عشرية** — كل الحسابات المالية تُقرَّب بـ `Math.round(n*1000)/1000` في كل خطوة لا في النهاية فقط.
2. **السجلات الخام لا تُعدل** — جدول `AttendanceLog` إضافي فقط (append-only)؛ التصحيح يتم بإعادة معالجة الحالة اليومية، وحذف سجل خام حق للمدير فقط مع تسجيل تدقيق.
3. **لا تكرار للسجلات أبدًا** — قيد فريد `(sn, pin, punchTime, status)`؛ إعادة إرسال الجهاز أو التقاطع بين مصدرين لا يولد سجلين.
4. **ربط pin بالموظف بترتيب محدد** — أولًا حقل `pin` ثم `code`؛ غير المطابق يعيش في شاشة «سجلات غير معروفة» حتى يُربط يدويًا.
5. **أولوية اليوم ثابتة** — Holiday ثم Leave معتمدة ثم Weekend (حسب `workDays` للوردية) ثم يوم عمل عادي؛ لا يتأثر ترتيبها بالإعدادات.
6. **الحساب اليومي واحد للمعادلة** — `firstIn`/`lastOut`/`workedMinutes` كما في القسم 5.4، وسجل واحد فقط يعني `missed_punch` لا `present`.
7. **التأخير والخروج المبكر بالدقائق مع السماحية** — لا خصم قبل استنفاد `graceMinutes`، والورديات الليلية تجاوز منتصف الليل تلقائيًا.
8. **الإضافي ميزة مفعلة** — لا يُحتسب إلا إذا `otEnabled` بالوردية، ويُقرَّب لأقرب `otRoundMinutes`، ومضاعفة 1.25/1.5 من الإعدادات.
9. **يوم عمل بلا سجلات = absent** — ما لم تغطه عطلة أو إجازة معتمدة أو راحة أسبوعية.
10. **منع تداخل العقود النشطة** — لا عقد نشط ثانٍ لنفس الموظف يتقاطع زمنيًا مع عقد نشط قائم؛ والتجديد يُسجل بسلسلة `renewalOf` ويبدأ من تاريخ انتهاء سابقه.
11. **حالة العقد تتحدث تلقائيًا** — `expired` عند مرور `endDate` (أول عملية اليوم)، وتنبيهات الانتهاء 30/60/90 يومًا في لوحة التحكم.
12. **الإجازة المعتمدة تسري فورًا** — تغطي أيامها في `DailyAttendance` بحالة `leave` وتُحتسب من رصيد النوع؛ رفضها أو إلغاؤها يعيد المعالجة تلقائيًا.
13. **فترة الرواتب المعتمدة قفل نهائي** — `draft` وحدها تقبل إعادة الحساب؛ أي تعديل حضور بعد اعتماد فترة لا يغير قسائمها، وإعادة الفتح تحتاج مديرًا وتُسجل في التدقيق.
14. **فشل جزئي لا يوقف الكل** — فشل جهاز في المزامنة أو صف في الاستيراد يُوثق في التقرير ويكمل الباقي.
15. **كل كتابة تُرصد** — `AuditLog` بوصف عربي تلقائي + نقطة استعادة تلقائية بعد كل عملية كتابة من الواجهة.
16. **معايير المصادقة مطابقة لـ PropertyHub** — scrypt، جلسات 12 ساعة، rate limiting، وشاشة إعداد أول مرة، دون أي مكتبات خارجية للمصادقة.

## 14) النشر وربط GitHub (Vercel + Prisma Postgres)

- مستودع GitHub جديد مستقل باسم **hrhub** — لا يُستخدم مستودع PropertyHub ولا تُنسخ بياناته أو مفاتيحه، ويُفعّل النشر التلقائي: كل push على main ينشر خلال 2–3 دقائق.
- قاعدة بيانات **Prisma Postgres** مستضافة على Vercel و`DATABASE_URL` في متغيرات البيئة، مع `BLOB_READ_WRITE_TOKEN` لتخزين R2 إن فعّل.

```json
// vercel.json
{
  "buildCommand": "prisma generate && (prisma db push --accept-data-loss || echo 'WARN: db push skipped — DB unreachable, using existing schema') && next build",
  "framework": "nextjs"
}
```

- البناء المحلي للتحقق قبل الرفع: `DATABASE_URL="postgresql://check:check@localhost:5432/check" npx next build` (فقط لسلامة الكود، بلا اتصال حقيقي).
- **ملاحظة تشغيلية للأجهزة:** بروتوكول ADMS يعمل عبر HTTP فيصل على Vercel مباشرة (يُضبط الجهاز على دومين النظام والمنفذ 80 والمسار `/iclock/`). وللشبكات الداخلية المقفولة أو إدارة الأوامر العكسية المكثفة، يمكن لاحقًا إضافة خدمة VPS صغيرة دائمة تعمل كوسيط يمرر السجلات إلى نفس نقطة `/iclock/` — دون أي تغيير في قاعدة البيانات.
- ملفات الهوية: `src/app/icon.svg` + `src/app/apple-icon.svg` (شعار الموظف الأخضر الزمردي) و`public/logo.svg`، والعنوان في layout: «HRHub — إدارة الموارد البشرية والحضور والرواتب».

### 14.1 اختبار القبول النهائي (نفّذها بالترتيب)

1. إنشاء مدير أول ← إضافة قسم ومسمى ← إضافة موظف بصورة ← إضافة جهاز بالـ SN الحقيقي.
2. ضبط جهاز ZKTeco فعلي على ADMS = دومين النظام ← تظهر حالة online خلال دقيقة ← بصمة موظف ← السجلة تظهر في سجل البصمة والحضور اليومي خلال ثوانٍ.
3. إنشاء وردية ببداية 08:00 وسماح 10 دقائق ← بصمة دخول 08:25 ← حالة `late` وخصم تأخير صحيح في التقرير.
4. طلب إجازة ← اعتمادها من HR ← يوم الإجازة يتحول تلقائيًا إلى `leave` في الحضور اليومي.
5. إنشاء فترة راتب الشهر ← حساب ← قسيمة بصافٍ صحيح وتفقيط عربي ← اعتماد ← محاولة تعديل حضور لا تغيّر القسيمة.
6. استيراد Excel لـ 50 موظفًا ← تقرير لكل صف ← تصدير تقرير حضور شهري بنجاح.
7. اختبار سريع للأدوار: مشاهد لا يرى أزرار كتابة ومحاولته الكتابة ترجع 403 وتُسجل في التدقيق ✓

## 15) تعليمات التنفيذ للذكاء الاصطناعي (الترتيب الصحيح)

نفّذ البناء بهذا الترتيب بالضبط، واختبر كل خطوة قبل التالية:

1. **الهيكل:** مشروع جديد Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui كامل + Prisma بالمخطط أعلاه + `db push` — باسم `hrhub` في مستودع مستقل.
2. **المكتبات الأساسية:** `lib/db.ts` (عميل Prisma وحيد) ← `lib/auth.ts` (scrypt + جلسات + canWrite/canRead + rate limit) ← `lib/audit.ts` (logAudit) ← `lib/calc.ts` (تقريب 3 خانات ومعدلات) ← `lib/tafqit.ts` ← `lib/time.ts` (المنطقة الزمنية Asia/Kuwait وتجاوز منتصف الليل) ← `lib/attendance.ts` (خط المعالجة كاملًا) ← `lib/payroll.ts` (المحرك كاملًا) ← `lib/zk/protocol.ts` (فك ADMS: handshake/keep-alive/ATTLOG CSV وHex) ← `lib/zk/biotime.ts` (عميل REST) ← `lib/storage.ts` ← `lib/excel.ts` ← `lib/contracts.ts` (تحقق التداخل والتجديد).
3. **المصادقة:** مسارات auth + setup + شاشتا LoginScreen و SetupScreen.
4. **CRUD الأساسي:** departments ← positions ← employees بكل مساراتها مع رفع الصور وضغط المتصفح.
5. **العقود** بتحقق التداخل والتجديد والحالة التلقائية والتنبيهات.
6. **الورديات وتوزيعها** (فردي وجماعي) مع الورديات الليلية.
7. **مستقبل ADMS** `/iclock/*` كاملًا: handshake، keep-alive، ATTLOG CSV وHex، USERINFO، رفض SN غير المسجل حسب الإعداد، وصفحة الأجهزة بالحالة الحية.
8. **خط معالجة الحضور:** recompute لليوم والفترة بكل قواعد التغطية والأولوية، وشاشة «سجلات غير معروفة».
9. **الإجازات والعطلات** بسير الموافقات ودمجهما في المعالج تلقائيًا.
10. **مزامنة BioTime REST** + الاستيراد والتصدير Excel لكل الأقسام بقوالبها وتقاريرها لكل صف.
11. **محرك الرواتب:** مكونات ← فترات ← compute/approve/pay ← قسائم مطبوعة بالتفقيط ← تصدير بنك.
12. **التقارير الستة** بفلاترها وتصديرها + لوحة التحكم بالـ KPIs والسجل الحي.
13. **الواجهة الرئيسية والأدوار:** القائمة الجانبية اليمينية، درج الموبايل، أقسام admin المخفية والمحمية، سجل التدقيق ونقاط الاستعادة والإعدادات.
14. **النشر:** vercel.json + GitHub (hrhub) + Prisma Postgres، ثم نفّذ قائمة اختبار القبول في 14.1 كاملة ✓.

---

**خلاصة:** HRHub = بديل عربي متكامل لـ BioTime: أجهزة بصمة ZKTeco تدفع السجلات مباشرة بالـ IP، ومعالجة آلية شفافة للورديات والتأخير والإضافي، وملف موظف كامل بالصور والعقود والإجازات، ورواتب تُبنى من الحضور بمعادلات معلنة بالدينار الكويتي، مع استيراد وتصدير Excel وتقارير شاملة وأدوار وصلاحيات صارمة وسجل تدقيق ونقاط استعادة — بنفس الهيكل التقني ونمط التصميم وجودة التنفيذ المجرّبة في PropertyHub، وبمستودع وقاعدة بيانات مستقلين تمامًا.
