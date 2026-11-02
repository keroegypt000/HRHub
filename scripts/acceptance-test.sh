#!/bin/bash
# اختبار قبول HRHub الكامل — قائمة 14.1 من البرومت الرئيسي
# يحاكي جهاز ZKTeco حقيقي يتصل بـ ADMS
set -e
B="http://localhost:3000"
J="Content-Type: application/json"
PASS=0; FAIL=0
say() { echo -e "\n\033[1;36m═══ $1 ═══\033[0m"; }
ok()  { PASS=$((PASS+1)); echo -e "  \033[1;32m✓ $1\033[0m"; }
bad() { FAIL=$((FAIL+1)); echo -e "  \033[1;31m✗ $1\033[0m"; }
chk() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (متوقع: $2 — فعلي: $1)"; fi }

say "1) الإعداد الأول: مدير + قسم + مسمى + موظف + جهاز"
SETUP=$(curl -s $B/api/setup -X POST -H "$J" -d '{"username":"admin","name":"مدير النظام","password":"Admin@12345","companyName":"شركة الأفق للتشغيل والصيانة"}')
echo "$SETUP" | grep -q '"created":true' && ok "إنشاء مدير أول" || { echo "$SETUP" | grep -q 'مهيأ مسبقًا' && ok "النظام مهيأ مسبقًا (تخطي)" || bad "إنشاء مدير أول: $SETUP"; }
TOKEN=$(curl -s $B/api/auth/login -X POST -H "$J" -d '{"username":"admin","password":"Admin@12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$TOKEN" ] && ok "تسجيل دخول + توكن" || bad "تسجيل دخول"
A="Authorization: Bearer $TOKEN"

DEPT_ID=$(curl -s "$B/api/departments?search=%D8%A7%D9%84%D8%A5%D8%AF%D8%A7%D8%B1%D8%A9%20%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9" -H "$A" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'];print(r[0]['id'] if r else '')")
[ -n "$DEPT_ID" ] || DEPT_ID=$(curl -s $B/api/departments -X POST -H "$J" -H "$A" -d '{"name":"الإدارة المالية"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$DEPT_ID" ] && ok "إنشاء قسم (أو القائم)" || bad "إنشاء قسم"

POS_ID=$(curl -s "$B/api/positions?search=%D9%85%D8%AD%D8%A7%D8%B3%D8%A8%20%D8%A3%D9%88%D9%84" -H "$A" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'];print(r[0]['id'] if r else '')")
[ -n "$POS_ID" ] || POS_ID=$(curl -s $B/api/positions -X POST -H "$J" -H "$A" -d '{"name":"محاسب أول"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$POS_ID" ] && ok "إنشاء مسمى (أو القائم)" || bad "إنشاء مسمى"

# موظف 1001: إنشاء أو جلب القائم (تماثل الاختبار)
EMP_CODE=$(curl -s "$B/api/employees?search=1001" -H "$A" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'];print(r[0]['id'] if any(e['code']=='1001' for e in r) else '')")
if [ -n "$EMP_CODE" ]; then
  EMP_ID=$EMP_CODE; ok "موظف 1001 موجود (تخطي)"
else
  EMP=$(curl -s $B/api/employees -X POST -H "$J" -H "$A" -d "{\"code\":\"1001\",\"name\":\"أحمد محمد السالم\",\"departmentId\":\"$DEPT_ID\",\"positionId\":\"$POS_ID\",\"basicSalary\":850,\"pin\":\"1001\",\"civilId\":\"289010103456\",\"nationality\":\"كويتي\",\"bankAccount\":\"KW0100012345678\"}")
  EMP_ID=$(echo "$EMP" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  [ -n "$EMP_ID" ] && ok "إنشاء موظف 1001" || bad "إنشاء موظف 1001"
fi

# صورة الموظف (PNG 1x1)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?\x00\x05\xfe\x02\xfe\xa75\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/photo.png
PH=$(curl -s $B/api/employees/$EMP_ID/photo -X POST -H "$A" -F "file=@/tmp/photo.png;type=image/png")
echo "$PH" | grep -q '"photoId"' && ok "رفع صورة موظف" || bad "رفع صورة موظف"

DEV=$(curl -s $B/api/devices -X POST -H "$J" -H "$A" -d '{"sn":"CJ9X204860122","name":"جهاز المدخل الرئيسي","model":"K40","location":"المدخل الرئيسي"}')
echo "$DEV" | grep -q '"sn"' && ok "إضافة جهاز SN=CJ9X204860122" || bad "إضافة جهاز"

EMP2_CODE=$(curl -s "$B/api/employees?search=1002" -H "$A" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'];print(r[0]['id'] if any(e['code']=='1002' for e in r) else '')")
if [ -n "$EMP2_CODE" ]; then
  EMP2_ID=$EMP2_CODE; ok "موظف 1002 موجود (تخطي)"
else
  EMP2_ID=$(curl -s $B/api/employees -X POST -H "$J" -H "$A" -d '{"code":"1002","name":"فاطمة علي الخالدي","basicSalary":650,"pin":"1002","nationality":"مصري"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  [ -n "$EMP2_ID" ] && ok "إنشاء موظف 1002" || bad "إنشاء موظف 1002"
fi

say "2) محاكاة جهاز ZKTeco حقيقي عبر ADMS"
HS=$(curl -s "$B/iclock/cdata?SN=CJ9X204860122&pushver=3.1.15&options=all")
echo "$HS" | grep -q "^OK" && ok "handshake: رد OK + إعدادات ($(echo "$HS" | head -2 | tail -1))" || bad "handshake"
KA=$(curl -s "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=0")
echo "$KA" | grep -q "^OK" && ok "keep-alive: OK" || bad "keep-alive"
ST=$(curl -s "$B/api/devices" -H "$A" | python3 -c "import sys,json;d=json.load(sys.stdin)['rows'][0];print(d['status'])")
chk "$ST" "online" "حالة الجهاز online خلال ثوانٍ"

# بصمة دخول اليوم 08:25 (متأخر عن وردية 08:00 بسماح 10 دقائق) ثم خروج 17:30 (إضافي)
TODAY=$(TZ=Asia/Kuwait date +%F)
T1="$TODAY 08:25:00"
T2="$TODAY 17:30:00"
R1=$(curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=1" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T1"$'\t0\t1\t')
R2=$(curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=2" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T2"$'\t1\t1\t')
[ "$R1" = "OK" ] && [ "$R2" = "OK" ] && ok "دفع بصمتين (دخول 08:25 + خروج 17:30)" || bad "دفع بصمات ($R1/$R2)"

# إعادة إرسال نفس السجلة — يجب ألا يتكرر (قاعدة 3)
curl -s -X POST "$B/iclock/cdata?SN=CJ9X204860122&table=ATTLOG&stamp=3" -H "Content-Type: text/plain" --data-binary $'1001\t'"$T1"$'\t0\t1\t' > /dev/null
DUP=$(curl -s "$B/api/attendance-logs?from=$TODAY&to=$TODAY" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['total'])")
chk "$DUP" "2" "منع التكرار: إعادة الإرسال لا تولد سجلًا ثالثًا"

sleep 1
DA=$(curl -s "$B/api/daily-attendance?from=$TODAY&to=$TODAY&employeeId=$EMP_ID" -H "$A")
STATUS=$(echo "$DA" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'][0];print(r['status'],r['lateMinutes'],r['otMinutes'])")
echo "     → الحالة اليومية: $STATUS"
echo "$STATUS" | grep -q "^late " && ok "الحالة = late" || bad "الحالة = late (فعلي: $STATUS)"
echo "$STATUS" | grep -q "^late 15 30$" && ok "تأخير 15 دقيقة (08:25 − 08:10 حد السماحية) + إضافي 30 دقيقة" || bad "تأخير 15 + إضافي 30 (فعلي: $STATUS)"

say "3) الإجازة: طلب ← اعتماد ← اليوم يتحول leave"
LV_TYPE=$(curl -s "$B/api/leave-types" -H "$A" | python3 -c "import sys,json;print([t['id'] for t in json.load(sys.stdin)['rows'] if t['code']=='ANNUAL'][0])")
LV=$(curl -s $B/api/leaves -X POST -H "$J" -H "$A" -d "{\"employeeId\":\"$EMP2_ID\",\"leaveTypeId\":\"$LV_TYPE\",\"fromDate\":\"$TODAY\",\"toDate\":\"$TODAY\",\"reason\":\"سفر شخصي\"}")
LV_ID=$(echo "$LV" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$LV_ID" ] && ok "إنشاء طلب إجازة" || bad "إنشاء طلب إجازة"
curl -s $B/api/leaves/$LV_ID -X PATCH -H "$J" -H "$A" -d '{"action":"approve"}' | grep -q approved && ok "اعتماد HR" || bad "اعتماد HR"
S2=$(curl -s "$B/api/daily-attendance?from=$TODAY&to=$TODAY&employeeId=$EMP2_ID" -H "$A" | python3 -c "import sys,json;r=json.load(sys.stdin)['rows'][0];print(r['status'])")
chk "$S2" "leave" "يوم الإجازة تحول تلقائيًا إلى leave"

say "4) فترة الرواتب: حساب ← تفقيط ← اعتماد ← قفل"
MONTH="${TODAY:0:7}"
PER=$(curl -s $B/api/payroll-periods -X POST -H "$J" -H "$A" -d "{\"name\":\"$MONTH\"}")
PER_ID=$(echo "$PER" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$PER_ID" ] && ok "إنشاء فترة $MONTH" || bad "إنشاء فترة"
COMP=$(curl -s $B/api/payroll-periods/$PER_ID/compute -X POST -H "$A")
echo "$COMP" | grep -q employees && ok "حساب القسائم: $(echo "$COMP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f\"{d['employees']} موظفًا، صافي {d['totalNet']} د.ك\")")" || bad "حساب القسائم"
SLIP=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A")
NET=$(echo "$SLIP" | python3 -c "import sys,json;s=json.load(sys.stdin)['rows'][0];print(s['netPay'],s['netPayTafqit'],s['lateDeduction'],s['otAmount'])")
echo "     → قسيمة 1001: صافي/تفقيط/خصم تأخير/إضافي = $NET"
LATE_DED=$(echo "$SLIP" | python3 -c "import sys,json;print(json.load(sys.stdin)['rows'][0]['lateDeduction'])")
# أجر الساعة = round3(850/26/8)=4.087 → أجر الدقيقة = round3(4.087/60)=0.068 → ×15د = 1.02
chk "$LATE_DED" "1.02" "خصم التأخير = أجر الدقيقة (0.068) × 15د = 1.02 د.ك"
TAQ=$(echo "$SLIP" | python3 -c "import sys,json;print(json.load(sys.stdin)['rows'][0]['netPayTafqit'])")
[ -n "$TAQ" ] && ok "التفقيط العربي يعمل: «$TAQ»" || bad "التفقيط"
curl -s $B/api/payroll-periods/$PER_ID/approve -X POST -H "$A" | grep -q approved && ok "اعتماد الفترة (قفل نهائي)" || bad "اعتماد الفترة"
# تعديل حضور بعد الاعتماد لا يغير القسيمة (قاعدة 13)
curl -s $B/api/attendance/recompute -X POST -H "$J" -H "$A" -d "{\"from\":\"$TODAY\",\"to\":\"$TODAY\"}" > /dev/null
NET2=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['rows'][0]['netPay'])")
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
SUCCESS=$(echo "$IMP" | python3 -c "import sys,json;print(json.load(sys.stdin)['success'])")
chk "$SUCCESS" "50" "استيراد 50 موظفًا بتقرير لكل صف"
EXPORT_CODE=$(curl -s -o /tmp/export.xlsx -w "%{http_code}" "$B/api/export?entity=employees" -H "$A")
[ "$EXPORT_CODE" = "200" ] && ok "تصدير Excel للموظفين ($(stat -c%s /tmp/export.xlsx) بايت)" || bad "تصدير Excel"
curl -s -o /tmp/tpl.xlsx -w "" "$B/api/import/template?entity=attendance-logs" -H "$A" && ok "تنزيل قالب سجل البصمة" || bad "تنزيل قالب"

say "6) الأدوار: مشاهد لا يكتب (403 + تدقيق)"
V_TOKEN=$(curl -s $B/api/users -X POST -H "$J" -H "$A" -d '{"username":"viewer1","name":"مشاهد التقارير","password":"View@12345","role":"viewer"}' > /dev/null; curl -s $B/api/auth/login -X POST -H "$J" -d '{"username":"viewer1","password":"View@12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
V_CODE=$(curl -s -o /dev/null -w "%{http_code}" $B/api/employees -X POST -H "$J" -H "Authorization: Bearer $V_TOKEN" -d '{"code":"9999","name":"ممنوع"}')
chk "$V_CODE" "403" "مشاهد → 403 على الكتابة"
AUDIT=$(curl -s "$B/api/audit?action=denied" -H "$A" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['total']>0)")
[ "$AUDIT" = "True" ] && ok "محاولة الرفض مسجلة في سجل التدقيق" || bad "تسجيل الرفض في التدقيق"
# اخفاء الأقسام الإدارية
AD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/audit" -H "Authorization: Bearer $V_TOKEN")
chk "$AD_CODE" "403" "مشاهد محمي من سجل التدقيق (مدير فقط)"

say "7) المستندات والاستعادة والسجل الحي"
RP=$(curl -s "$B/api/restore" -H "$A" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['rows'])>0)")
[ "$RP" = "True" ] && ok "نقاط الاستعادة التلقائية تعمل ($(curl -s "$B/api/restore" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["rows"]))') نقطة)" || bad "نقاط الاستعادة"
BIOS=$(curl -s "$B/api/dashboard" -H "$A" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['kpis']['present'],d['kpis']['devicesOnline'],len(d['latestLogs'])>0)")
echo "     → لوحة التحكم KPIs: حاضرون/أجهزة متصلة/سجل حي = $BIOS"

say "8) الجهاز المحلي (سحب عبر 4370) + استيراد USB"
# الجهاز المحاكى mock-zk-device.js يجب أن يعمل على 127.0.0.1:4370
LC=$(curl -s $B/api/devices -X POST -H "$J" -H "$A" -d '{"name":"جهاز الورشة محلي","sn":"MOCKSN001","mode":"local","ipAddress":"127.0.0.1","port":4370}')
LC_ID=$(echo "$LC" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$LC_ID" ] && ok "إضافة جهاز محلي mode=local" || bad "إضافة جهاز محلي: $LC"
PULL=$(curl -s -m 40 $B/api/devices/$LC_ID/pull -X POST -H "$A")
INS=$(echo "$PULL" | python3 -c "import sys,json;print(json.load(sys.stdin).get('inserted','-'))")
chk "$INS" "7" "سحب محلي: 7 سجلات من المحاكى (pin/وقت/حالة/تحقق)"
PULL2=$(curl -s -m 40 $B/api/devices/$LC_ID/pull -X POST -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin).get('inserted','-'))")
chk "$PULL2" "0" "إعادة السحب لا تكرر (قاعدة 3)"
UNK=$(curl -s "$B/api/attendance-logs?unknown=1&limit=500" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['total'])")
[ "$UNK" -ge 1 ] && ok "pin غير معروف (7777) يظهر في شاشة الربط" || bad "سجلات غير معروفة"
# استيراد USB: ملف بصمات بترميز الجهاز
printf '~SerialNumber=USBSN2026\tAttendance Records=>\n1002\t2026-11-01 07:58:00\t0\t1\n1002\t2026-11-01 16:35:00\t1\t4\n' > /tmp/usb_attlog.dat
USB=$(curl -s $B/api/import/usb -X POST -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/usb_attlog.dat")
UIN=$(echo "$USB" | python3 -c "import sys,json;print(json.load(sys.stdin).get('imported','-'))")
chk "$UIN" "2" "استيراد USB: سجلان من 1_attlog.dat مع SN من الرأس"
USB2=$(curl -s $B/api/import/usb -X POST -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/usb_attlog.dat" | python3 -c "import sys,json;print(json.load(sys.stdin).get('imported','-'))")
chk "$USB2" "0" "إعادة رفع USB لا تكرر"
# قسيمة الطباعة من السيرفر
SLIP_ID2=$(curl -s "$B/api/payslips?periodId=$PER_ID&employeeId=$EMP_ID" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['rows'][0]['id'])")
PR=$(curl -s -o /tmp/print2.html -w "%{http_code}" "$B/api/payslips/$SLIP_ID2/print" -H "$A")
chk "$PR" "200" "قسيمة مطبوعة من السيرفر /api/payslips/[id]/print"
grep -q "صافي الراتب المستحق" /tmp/print2.html && ok "القسيمة تحمل بنودها وتفقيطها" || bad "محتوى القسيمة"
# ملف بنك CSV
BANK_TYPE=$(curl -s -o /tmp/bank3.csv -w "%{http_code}" "$B/api/export?entity=bank&periodId=$PER_ID" -H "$A")
chk "$BANK_TYPE" "200" "تصدير ملف بنك CSV"
head -1 /tmp/bank3.csv | grep -q "الرقم الوظيفي" && ok "أعمدة البنك: الرقم الوظيفي/الاسم/الحساب/الصافي" || bad "أعمدة البنك"

say "═══ النتيجة النهائية ═══"
echo -e "  \033[1;32mنجح: $PASS\033[0m  \033[1;31mفشل: $FAIL\033[0m"
[ $FAIL -eq 0 ] && echo -e "  🎉 \033[1;32mكل اختبارات القبول نجحت\033[0m" || echo "  ⚠️ راجع البنود الفاشلة أعلاه"
