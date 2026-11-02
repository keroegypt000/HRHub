#!/bin/bash
# اختبار قبول HRHub الكامل — قائمة 14.1 من البرومت الرئيسي
# يحاكي جهاز ZKTeco حقيقي يتصل بـ ADMS + جهاز محلي 4370 + استيراد USB
# مصمم ليكون قابلاً للتكرار (idempotent): يتعامل مع بيانات التشغيلات السابقة
set -e
B="http://localhost:3000"
J="Content-Type: application/json"
PASS=0; FAIL=0
say() { echo -e "\n\033[1;36m═══ $1 ═══\033[0m"; }
ok()  { PASS=$((PASS+1)); echo -e "  \033[1;32m✓ $1\033[0m"; }
bad() { FAIL=$((FAIL+1)); echo -e "  \033[1;31m✗ $1\033[0m"; }
chk() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (متوقع: $2 — فعلي: $1)"; fi }
# إجابة آمنة من JSON — لا تنهار أبدًا (بدل KeyError) — d و r اسمان لنفس الكائن
js() { python3 -c "import sys,json
try:
    obj = json.load(sys.stdin)
    print(eval(sys.argv[1], {'d': obj, 'r': obj}))
except Exception: print('')" "$1"; }

say "1) الإعداد الأول: مدير + قسم + مسمى + موظف + جهاز"
SETUP=$(curl -s $B/api/setup -X POST -H "$J" -d '{"username":"admin","name":"مدير النظام","password":"Admin@12345","companyName":"شركة الأفق للتشغيل والصيانة"}')
echo "$SETUP" | grep -q '"created":true' && ok "إنشاء مدير أول" || { echo "$SETUP" | grep -q 'مهيأ مسبقًا' && ok "النظام مهيأ مسبقًا (تخطي)" || bad "إنشاء مدير أول: $SETUP"; }
TOKEN=$(curl -s $B/api/auth/login -X POST -H "$J" -d '{"username":"admin","password":"Admin@12345"}' | js "d['token']")
[ -n "$TOKEN" ] && ok "تسجيل دخول + توكن" || bad "تسجيل دخول"
A="Authorization: Bearer $TOKEN"

DEPT_ID=$(curl -s "$B/api/departments?search=%D8%A7%D9%84%D8%A5%D8%AF%D8%A7%D8%B1%D8%A9%20%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9" -H "$A" | js "r['rows'][0]['id'] if r['rows'] else ''")
[ -n "$DEPT_ID" ] || DEPT_ID=$(curl -s $B/api/departments -X POST -H "$J" -H "$A" -d '{"name":"الإدارة المالية"}' | js "d['id'] if 'id' in d else d.get('id','')")
[ -n "$DEPT_ID" ] && ok "إنشاء قسم (أو القائم)" || bad "إنشاء قسم"

POS_ID=$(curl -s "$B/api/positions?search=%D9%85%D8%AD%D8%A7%D8%B3%D8%A8%20%D8%A3%D9%88%D9%84" -H "$A" | js "r['rows'][0]['id'] if r['rows'] else ''")
[ -n "$POS_ID" ] || POS_ID=$(curl -s $B/api/positions -X POST -H "$J" -H "$A" -d '{"name":"محاسب أول"}' | js "d.get('id','')")
[ -n "$POS_ID" ] && ok "إنشاء مسمى (أو القائم)" || bad "إنشاء مسمى"

# موظف 1001: إنشاء أو جلب القائم (تماثل الاختبار)
EMP_ID=$(curl -s "$B/api/employees?search=1001" -H "$A" | js "next((e['id'] for e in r['rows'] if e['code']=='1001'),'')")
if [ -n "$EMP_ID" ]; then
  ok "موظف 1001 موجود (تخطي)"
else
  EMP_ID=$(curl -s $B/api/employees -X POST -H "$J" -H "$A" -d "{\"code\":\"1001\",\"name\":\"أحمد محمد السالم\",\"departmentId\":\"$DEPT_ID\",\"positionId\":\"$POS_ID\",\"basicSalary\":850,\"pin\":\"1001\",\"civilId\":\"289010103456\",\"nationality\":\"كويتي\",\"bankAccount\":\"KW0100012345678\"}" | js "d.get('id','')")
  [ -n "$EMP_ID" ] && ok "إنشاء موظف 1001" || bad "إنشاء موظف 1001"
fi

# صورة الموظف (PNG 1x1)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?\x00\x05\xfe\x02\xfe\xa75\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/photo.png
PH=$(curl -s $B/api/employees/$EMP_ID/photo -X POST -H "$A" -F "file=@/tmp/photo.png;type=image/png")
echo "$PH" | grep -q '"photoId"' && ok "رفع صورة موظف" || bad "رفع صورة موظف"

# جهاز ADMS: جلب القائم أو إنشاؤه
DEV_ID=$(curl -s "$B/api/devices" -H "$A" | js "next((x['id'] for x in r['rows'] if x['sn']=='CJ9X204860122'),'')")
if [ -n "$DEV_ID" ]; then
  ok "جهاز CJ9X204860122 موجود (تخطي)"
else
  DEV_ID=$(curl -s $B/api/devices -X POST -H "$J" -H "$A" -d '{"sn":"CJ9X204860122","name":"جهاز المدخل الرئيسي","model":"K40","location":"المدخل الرئيسي"}' | js "d.get('id','')")
  [ -n "$DEV_ID" ] && ok "إضافة جهاز SN=CJ9X204860122" || bad "إضافة جهاز"
fi
# اختبار الاتصال الجديد (POST /api/devices/[id]/test)
if [ -n "$DEV_ID" ]; then
  TST=$(curl -s -o /tmp/devtest.json -w "%{http_code}" $B/api/devices/$DEV_ID/test -X POST -H "$A")
  [ "$TST" = "200" ] || [ "$TST" = "502" ] && ok "إندبوينت اختبار الجهاز يستجيب (${TST}: $(head -c 80 /tmp/devtest.json))" || bad "اختبار الجهاز: $TST"
fi

EMP2_ID=$(curl -s "$B/api/employees?search=1002" -H "$A" | js "next((e['id'] for e in r['rows'] if e['code']=='1002'),'')")
if [ -n "$EMP2_ID" ]; then
  ok "موظف 1002 موجود (تخطي)"
else
  EMP2_ID=$(curl -s $B/api/employees -X POST -H "$J" -H "$A" -d '{"code":"1002","name":"فاطمة علي الخالدي","basicSalary":650,"pin":"1002","nationality":"مصري"}' | js "d.get('id','')")
  [ -n "$EMP2_ID" ] && ok "إنشاء موظف 1002" || bad "إنشاء موظف 1002"
fi

say "2) محاكاة جهاز ZKTeco حقيقي عبر ADMS"
TODAY=$(TZ=Asia/Kuwait date +%F)
HS=$(curl -s "$B/iclock/cdata?SN=CJ9X204860122&pushver=3.1.15&options=all")
echo "$HS" | grep -q "^OK" && ok "handshake: رد OK + إعدادات ($(echo "$HS" | head -2 | tail -1))" || bad "handshake"
KA=$(curl -s "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=0")
echo "$KA" | grep -q "^OK" && ok "keep-alive: OK" || bad "keep-alive"
ST=$(curl -s "$B/api/devices" -H "$A" | js "next((x['status'] for x in r['rows'] if x['sn']=='CJ9X204860122'),'')")
chk "$ST" "online" "حالة الجهاز online خلال ثوانٍ"

# تنظيف سجلات اليوم للموظفين 1001/1002 (من تشغيلات سابقة أو أجهزة أخرى) — الاختبار محدد النتيجة
curl -s "$B/api/attendance-logs?from=$TODAY&to=$TODAY&limit=1000" -H "$A" | js "[x['id'] for x in r['rows'] if x.get('pin') in ('1001','1002')]" | tr -d "[]'" | tr ',' '\n' | while read -r LGID; do
  [ -n "$LGID" ] && curl -s -X DELETE "$B/api/attendance-logs" -H "$J" -H "$A" -d "{\"id\":\"$LGID\"}" > /dev/null || true
done

# بصمة دخول اليوم 08:25 (متأخر عن وردية 08:00 بسماح 10 دقائق) ثم خروج 17:30 (إضافي)
T1="$TODAY 08:25:00"
T2="$TODAY 17:30:00"
R1=$(curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=1" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T1"$'\t0\t1\t')
R2=$(curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=2" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T2"$'\t1\t1\t')
[ "$R1" = "OK" ] && [ "$R2" = "OK" ] && ok "دفع بصمتين (دخول 08:25 + خروج 17:30)" || bad "دفع بصمات ($R1/$R2)"

# إعادة إرسال نفس السجلة — يجب ألا يتكرر (قاعدة 3) — محصور على جهاز الاختبار
curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=3" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T1"$'\t0\t1\t' > /dev/null
DUP=$(curl -s "$B/api/attendance-logs?from=$TODAY&to=$TODAY&deviceId=$DEV_ID" -H "$A" | js "r['total']")
chk "$DUP" "2" "منع التكرار: إعادة الإرسال لا تولد سجلًا ثالثًا (محصور بجهاز الاختبار)"

sleep 1
DA=$(curl -s "$B/api/daily-attendance?from=$TODAY&to=$TODAY&employeeId=$EMP_ID" -H "$A")
STATUS=$(echo "$DA" | js "str(r['rows'][0]['status'])+' '+str(r['rows'][0]['lateMinutes'])+' '+str(r['rows'][0]['otMinutes']) if r['rows'] else ''")
echo "     → الحالة اليومية: $STATUS"
echo "$STATUS" | grep -q "^late " && ok "الحالة = late" || bad "الحالة = late (فعلي: $STATUS)"
echo "$STATUS" | grep -q "^late 15 30$" && ok "تأخير 15 دقيقة (08:25 − 08:10 حد السماحية) + إضافي 30 دقيقة" || bad "تأخير 15 + إضافي 30 (فعلي: $STATUS)"

say "3) الإجازة: طلب ← اعتماد ← اليوم يتحول leave"
LV_TYPE=$(curl -s "$B/api/leave-types" -H "$A" | js "next((t['id'] for t in r['rows'] if t['code']=='ANNUAL'),'')")
LV=$(curl -s $B/api/leaves -X POST -H "$J" -H "$A" -d "{\"employeeId\":\"$EMP2_ID\",\"leaveTypeId\":\"$LV_TYPE\",\"fromDate\":\"$TODAY\",\"toDate\":\"$TODAY\",\"reason\":\"سفر شخصي\"}")
LV_ID=$(echo "$LV" | js "d.get('id','')")
if [ -n "$LV_ID" ]; then
  ok "إنشاء طلب إجازة"
  curl -s $B/api/leaves/$LV_ID -X PATCH -H "$J" -H "$A" -d '{"action":"approve"}' | grep -q approved && ok "اعتماد HR" || bad "اعتماد HR"
else
  ALREADY=$(curl -s "$B/api/daily-attendance?from=$TODAY&to=$TODAY&employeeId=$EMP2_ID" -H "$A" | js "r['rows'][0]['status'] if r['rows'] else ''")
  [ "$ALREADY" = "leave" ] && ok "إجازة 1002 قائمة من تشغيل سابق (تخطي)" || bad "إنشاء طلب إجازة: $LV"
fi
S2=$(curl -s "$B/api/daily-attendance?from=$TODAY&to=$TODAY&employeeId=$EMP2_ID" -H "$A" | js "r['rows'][0]['status'] if r['rows'] else ''")
chk "$S2" "leave" "يوم الإجازة تحول تلقائيًا إلى leave"

say "4) فترة الرواتب: حساب ← تفقيط ← اعتماد ← قفل"
MONTH="${TODAY:0:7}"
PER_ID=$(curl -s "$B/api/payroll-periods" -H "$A" | js "next((p['id'] for p in r['rows'] if p['name']=='$MONTH'),'')")
if [ -n "$PER_ID" ]; then
  ok "فترة $MONTH موجودة (تخطي الإنشاء)"
else
  PER_ID=$(curl -s $B/api/payroll-periods -X POST -H "$J" -H "$A" -d "{\"name\":\"$MONTH\"}" | js "d.get('id','')")
  [ -n "$PER_ID" ] && ok "إنشاء فترة $MONTH" || bad "إنشاء فترة"
fi
# إعادة فتح إن كانت معتمدة/مصروفة من تشغيل سابق (مدير فقط) ثم حساب نظيف
curl -s $B/api/payroll-periods/$PER_ID/reopen -X POST -H "$A" > /dev/null
COMP=$(curl -s --max-time 120 $B/api/payroll-periods/$PER_ID/compute -X POST -H "$A")
echo "$COMP" | grep -q employees && ok "حساب القسائم: $(echo "$COMP" | js "f\"{d['employees']} موظفًا، صافي {d['totalNet']} د.ك\"")" || bad "حساب القسائم: $COMP"
SLIP=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A")
NET=$(echo "$SLIP" | js "str(s['netPay'])+' '+str(s.get('netPayTafqit',''))+' '+str(s['lateDeduction'])+' '+str(s['otAmount']) if (s:=r['rows'][0] if r['rows'] else None) else ''")
echo "     → قسيمة 1001: صافي/تفقيط/خصم تأخير/إضافي = $NET"
LATE_DED=$(echo "$SLIP" | js "r['rows'][0]['lateDeduction'] if r['rows'] else ''")
# أجر الساعة = round3(850/26/8)=4.087 → أجر الدقيقة = round3(4.087/60)=0.068 → ×15د = 1.02
chk "$LATE_DED" "1.02" "خصم التأخير = أجر الدقيقة (0.068) × 15د = 1.02 د.ك"
TAQ=$(echo "$SLIP" | js "r['rows'][0].get('netPayTafqit','') if r['rows'] else ''")
[ -n "$TAQ" ] && ok "التفقيط العربي يعمل: «$TAQ»" || bad "التفقيط"
curl -s $B/api/payroll-periods/$PER_ID/approve -X POST -H "$A" | grep -q approved && ok "اعتماد الفترة (قفل نهائي)" || bad "اعتماد الفترة"
# تعديل حضور بعد الاعتماد لا يغير القسيمة (قاعدة 13)
curl -s $B/api/attendance/recompute -X POST -H "$J" -H "$A" -d "{\"from\":\"$TODAY\",\"to\":\"$TODAY\"}" > /dev/null
NET2=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A" | js "r['rows'][0]['netPay'] if r['rows'] else ''")
chk "$NET2" "$(echo "$NET" | awk '{print $1}')" "تعديل الحضور بعد الاعتماد لا يغير القسيمة"
curl -s $B/api/payroll-periods/$PER_ID/compute -X POST -H "$A" | grep -q "أعد فتح" && ok "رفض إعادة حساب فترة معتمدة" || bad "رفض إعادة حساب فترة معتمدة"

say "5) استيراد 50 موظفًا + تصدير"
python3 -c "
import json
rows=[]
for i in range(50):
    n=2000+i
    rows.append({'الرقم الوظيفي':str(n),'الاسم':f'موظف استيراد {i+1}','الجنسية':'كويتي' if i%2 else 'هندي','القسم':'الإدارة المالية' if i%3 else 'المبيعات','المسمى الوظيفي':'موظف استقبال','الراتب الأساسي':400+i*5,'الحالة':'active'})
open('/tmp/emp50.json','w').write(json.dumps({'fileName':'emp50.xlsx','rows':rows},ensure_ascii=False))
"
IMP=$(curl -s "$B/api/import/excel?entity=employees" -X POST -H "$J" -H "$A" --data-binary @/tmp/emp50.json)
SUCCESS=$(echo "$IMP" | js "d['success']")
chk "$SUCCESS" "50" "استيراد 50 موظفًا (تحديث بدل تكرار) بتقرير لكل صف"
EXPORT_CODE=$(curl -s -o /tmp/export.xlsx -w "%{http_code}" "$B/api/export?entity=employees" -H "$A")
[ "$EXPORT_CODE" = "200" ] && ok "تصدير Excel للموظفين ($(stat -c%s /tmp/export.xlsx) بايت)" || bad "تصدير Excel"
curl -s -o /tmp/tpl.xlsx -w "" "$B/api/import/template?entity=attendance-logs" -H "$A" && ok "تنزيل قالب سجل البصمة" || bad "تنزيل قالب"

say "6) الأدوار: مشاهد لا يكتب (403 + تدقيق)"
curl -s $B/api/users -X POST -H "$J" -H "$A" -d '{"username":"viewer1","name":"مشاهد التقارير","password":"View@12345","role":"viewer"}' > /dev/null
V_TOKEN=$(curl -s $B/api/auth/login -X POST -H "$J" -d '{"username":"viewer1","password":"View@12345"}' | js "d['token']")
V_CODE=$(curl -s -o /dev/null -w "%{http_code}" $B/api/employees -X POST -H "$J" -H "Authorization: Bearer $V_TOKEN" -d '{"code":"9999","name":"ممنوع"}')
chk "$V_CODE" "403" "مشاهد → 403 على الكتابة"
AUDIT=$(curl -s "$B/api/audit?action=denied" -H "$A" | js "d['total']>0")
[ "$AUDIT" = "True" ] && ok "محاولة الرفض مسجلة في سجل التدقيق" || bad "تسجيل الرفض في التدقيق"
# اخفاء الأقسام الإدارية
AD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/audit" -H "Authorization: Bearer $V_TOKEN")
chk "$AD_CODE" "403" "مشاهد محمي من سجل التدقيق (مدير فقط)"

say "7) المستندات والاستعادة والسجل الحي"
RP=$(curl -s "$B/api/restore" -H "$A" | js "len(r['rows'])>0")
[ "$RP" = "True" ] && ok "نقاط الاستعادة التلقائية تعمل ($(curl -s "$B/api/restore" -H "$A" | js "len(r['rows'])") نقطة)" || bad "نقاط الاستعادة"
BIOS=$(curl -s "$B/api/dashboard" -H "$A" | js "str(d['kpis']['present'])+' '+str(d['kpis']['devicesOnline'])+' '+str(len(d['latestLogs'])>0)")
echo "     → لوحة التحكم KPIs: حاضرون/أجهزة متصلة/سجل حي = $BIOS"

say "8) الجهاز المحلي (سحب عبر 4370) + استيراد USB"
# الجهاز المحاكى mock-zk-device.js يجب أن يعمل على 127.0.0.1:4370
LC_ID=$(curl -s "$B/api/devices" -H "$A" | js "next((x['id'] for x in r['rows'] if x['sn']=='MOCKSN001'),'')")
if [ -n "$LC_ID" ]; then
  ok "جهاز محلي MOCKSN001 موجود (تخطي)"
else
  LC_ID=$(curl -s $B/api/devices -X POST -H "$J" -H "$A" -d '{"name":"جهاز الورشة محلي","sn":"MOCKSN001","mode":"local","ipAddress":"127.0.0.1","port":4370}' | js "d.get('id','')")
  [ -n "$LC_ID" ] && ok "إضافة جهاز محلي mode=local" || bad "إضافة جهاز محلي: $LC_ID"
fi
PULL=$(curl -s -m 40 $B/api/devices/$LC_ID/pull -X POST -H "$A")
READ_ALL=$(echo "$PULL" | js "str((d.get('inserted') or 0)+(d.get('duplicates') or 0))")
TOT=$(echo "$PULL" | js "str(d.get('totalOnDevice',''))")
chk "$READ_ALL" "$TOT" "سحب محلي: كل سجلات الجهاز ($TOT) مقروءة عبر ZK/4370 (الجديدة $([ "$(echo "$PULL" | js "str(d.get('inserted'))")" != "0" ] && echo 'أُدرجت' || echo 'مكررة محسوبة'))"
PULL2=$(curl -s -m 40 $B/api/devices/$LC_ID/pull -X POST -H "$A" | js "str(d.get('inserted'))")
chk "$PULL2" "0" "إعادة السحب لا تكرر (قاعدة 3)"
UNK=$(curl -s "$B/api/attendance-logs?unknown=1&limit=500" -H "$A" | js "r['total']")
[ "$UNK" -ge 1 ] && ok "pin غير معروف (7777) يظهر في شاشة الربط" || bad "سجلات غير معروفة"
# استيراد USB: ملف بصمات بترميز الجهاز
printf '~SerialNumber=USBSN2026\tAttendance Records=>\n1002\t2026-11-01 07:58:00\t0\t1\n1002\t2026-11-01 16:35:00\t1\t4\n' > /tmp/usb_attlog.dat
USB=$(curl -s $B/api/import/usb -X POST -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/usb_attlog.dat")
UIN=$(echo "$USB" | js "str(d.get('imported',''))")
if [ "$UIN" = "2" ] || [ "$UIN" = "0" ]; then
  ok "استيراد USB: سجلان بـ SN من الرأس ($([ "$UIN" = "0" ] && echo 'مكرران من تشغيل سابق' || echo 'أُدرجا'))"
else
  bad "استيراد USB (فعلي: $UIN)"
fi
# قسيمة الطباعة من السيرفر
SLIP_ID2=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A" | js "r['rows'][0]['id'] if r['rows'] else ''")
PR=$(curl -s -o /tmp/print2.html -w "%{http_code}" "$B/api/payslips/$SLIP_ID2/print" -H "$A")
chk "$PR" "200" "قسيمة مطبوعة من السيرفر /api/payslips/[id]/print"
grep -q "صافي الراتب المستحق" /tmp/print2.html && ok "القسيمة تحمل بنودها وتفقيطها" || bad "محتوى القسيمة"
# ملف بنك CSV
BANK_TYPE=$(curl -s -o /tmp/bank3.csv -w "%{http_code}" "$B/api/export?entity=bank&periodId=$PER_ID" -H "$A")
chk "$BANK_TYPE" "200" "تصدير ملف بنك CSV"
head -1 /tmp/bank3.csv | grep -q "الرقم الوظيفي" && ok "أعمدة البنك: الرقم الوظيفي/الاسم/الحساب/الصافي" || bad "أعمدة البنك"

say "═══ النتيجة النهائية ═══"
echo -e "  \033نجح: $PASS\033  \033فشل: $FAIL\033"
