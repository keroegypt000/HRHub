'use client';

// لوحة التحكم: KPIs + سجل حي (polling كل 10 ثوانٍ) + اتجاه 30 يومًا + تنبيهات
import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { PageHeader } from '@/components/hrhub/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  Users, UserCheck, UserX, Plane, MonitorSmartphone, Clock3,
  AlertTriangle, FileSignature, Fingerprint, BellRing,
} from 'lucide-react';

interface ExpiryAlert {
  id: string; kind: string; kindAr: string; title: string; subtitle: string;
  expiry: string; daysLeft: number; level: 'expired' | 'd30' | 'd60' | 'd90';
}

interface DashboardData {
  kpis: {
    activeEmployees: number; present: number; late: number; absent: number;
    onLeave: number; missedPunch: number; devicesOnline: number; devicesTotal: number; pendingLeaves: number;
    halfDay?: number;
  };
  latestLogs: {
    id: string; time: string; date: string; employeeName: string | null; employeeCode: string | null;
    photoId: string | null; pin: string; deviceName: string; source: string;
  }[];
  trend: { date: string; present: number; late: number; absent: number }[];
  alerts: { contractId: string; contractNo: string; employeeName: string; endDate: string; daysLeft: number; level: number }[];
  devicesOfflineAlert: { id: string; name: string; lastSeenAt: string }[];
  isNewDevice: boolean;
}

function KpiCard({ title, value, sub, icon: Icon, tone }: {
  title: string; value: number | string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-extrabold tabular leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [live, setLive] = useState(true);
  const [expiry, setExpiry] = useState<{ alerts: ExpiryAlert[]; summary: { expired: number; d30: number; d60: number; d90: number } } | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const d = await api<DashboardData>('/api/dashboard');
        if (mounted) setData(d);
      } catch { /* تجاهل أخطاء polling */ }
    };
    const loadExpiry = () => {
      api<{ alerts: ExpiryAlert[]; summary: { expired: number; d30: number; d60: number; d90: number } }>('/api/alerts')
        .then((d) => { if (mounted) setExpiry(d); })
        .catch(() => {});
    };
    load();
    loadExpiry();
    const t = setInterval(load, 10_000); // سجل حي كل 10 ثوانٍ — إحساس BioTime
    const t2 = setInterval(loadExpiry, 60_000); // التنبيهات كل دقيقة
    return () => { mounted = false; clearInterval(t); clearInterval(t2); };
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const k = data.kpis;
  const trend = data.trend.map((t) => ({ ...t, day: t.date.slice(5) }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="لوحة التحكم"
        subtitle={`حاضرون اليوم ${k.present} من ${k.activeEmployees} موظفًا نشطًا — التحديث الحي كل 10 ثوانٍ`}
        actions={
          <Badge variant="outline" className={live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-1 inline-block" />
            مباشر
          </Badge>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="موظفون نشطون" value={k.activeEmployees} icon={Users} tone="bg-emerald-100 text-emerald-700" />
        <KpiCard title="حاضرون اليوم" value={k.present} sub={`منهم متأخرون: ${k.late}`} icon={UserCheck} tone="bg-green-100 text-green-700" />
        <KpiCard title="متأخرون" value={k.late} sub={`نص يوم: ${k.halfDay ?? 0}`} icon={Clock3} tone="bg-amber-100 text-amber-700" />
        <KpiCard title="غياب اليوم" value={k.absent} sub={`بصمة ناقصة: ${k.missedPunch}`} icon={UserX} tone="bg-red-100 text-red-700" />
        <KpiCard title="في إجازة" value={k.onLeave} sub={`طلبات معلقة: ${k.pendingLeaves}`} icon={Plane} tone="bg-blue-100 text-blue-700" />
        <KpiCard title="أجهزة متصلة" value={`${k.devicesOnline}/${k.devicesTotal}`} icon={MonitorSmartphone} tone="bg-teal-100 text-teal-700" />
        <KpiCard title="عقود تنتهي قريبًا" value={data.alerts.length} sub="خلال 90 يومًا" icon={FileSignature} tone="bg-orange-100 text-orange-700" />
        <KpiCard
          title="تنبيهات نفاذ الجوازات والسيارات وعقود الشركة"
          value={expiry ? (expiry.summary.expired + expiry.summary.d30 + expiry.summary.d60 + expiry.summary.d90) : 0}
          sub={expiry && expiry.summary.expired > 0 ? `منها ${expiry.summary.expired} منتهية الآن!` : 'خلال 90 يومًا'}
          icon={BellRing}
          tone={expiry && expiry.summary.expired > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}
        />
        <KpiCard title="سجلات حية" value={data.latestLogs.length} sub="آخر السجلات أسفل" icon={Fingerprint} tone="bg-teal-100 text-teal-700" />
      </div>

      {/* تنبيهات */}
      {(data.alerts.length > 0 || data.devicesOfflineAlert.length > 0 || data.isNewDevice || (expiry && expiry.alerts.length > 0)) && (
        <div className="space-y-2">
          {data.isNewDevice && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              جهاز جديد أرسل بصماته وتم قبوله تلقائيًا — وثّقه وسمّه من صفحة الأجهزة.
            </div>
          )}
          {data.devicesOfflineAlert.map((d) => (
            <div key={d.id} className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              الجهاز «{d.name}» منقطع منذ أكثر من 10 دقائق — آخر ظهور {fmtDateTime(d.lastSeenAt)}
            </div>
          ))}
          {data.alerts.slice(0, 3).map((a) => (
            <div key={a.contractId} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900 flex items-center gap-2">
              <FileSignature className="h-4 w-4 shrink-0" />
              عقد {a.contractNo} للموظف {a.employeeName} ينتهي خلال {a.daysLeft} يومًا ({a.endDate.slice(0, 10)})
            </div>
          ))}
          {expiry && expiry.alerts.slice(0, 4).map((a) => (
            <div key={`${a.kind}-${a.id}`} className={a.level === 'expired'
              ? 'rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-center gap-2'
              : 'rounded-lg border border-orange-200 bg-orange-50/70 p-3 text-sm text-orange-900 flex items-center gap-2'}>
              <BellRing className="h-4 w-4 shrink-0" />
              {a.kindAr}: {a.title} {a.subtitle ? `— ${a.subtitle}` : ''} {' '}
              {a.daysLeft < 0 ? <b>منتهي منذ {Math.abs(a.daysLeft)} يوم</b> : `ينتهي خلال ${a.daysLeft} يومًا`}
            </div>
          ))}
        </div>
      )}

      {/* اتجاه 30 يومًا */}
      <Card>
        <CardHeader className="pb-0"><CardTitle className="text-base">اتجاه الحضور — آخر 30 يومًا</CardTitle></CardHeader>
        <CardContent className="h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1F8A70" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#1F8A70" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="present" name="حاضرون" stroke="#1F8A70" fill="url(#gPresent)" strokeWidth={2} />
              <Area type="monotone" dataKey="late" name="متأخرون" stroke="#F59E0B" fill="url(#gLate)" strokeWidth={2} />
              <Area type="monotone" dataKey="absent" name="غياب" stroke="#EF4444" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* السجل الحي */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            آخر 10 سجلات بصمة حية
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto">
          {data.latestLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              لا توجد سجلات بعد — اربط جهاز ZKTeco واضبط ADMS على دومين النظام والمسار /iclock/
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.latestLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                    {log.photoId ? (
                       
                      <img src={`/api/files/${log.photoId}`} alt={log.employeeName || log.pin} className="h-full w-full object-cover" />
                    ) : (log.employeeName || log.pin || '؟').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {log.employeeName || <span className="text-amber-700">Pin غير معروف: {log.pin}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.employeeCode ? `رقم ${log.employeeCode} · ` : ''}{log.deviceName} · {log.source}
                    </p>
                  </div>
                  <Badge variant="outline" className="tabular shrink-0">{log.date} {log.time}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
