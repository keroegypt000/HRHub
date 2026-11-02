'use client';

// ADMS FOR HR MANAGMENT — المكوّن الرئيسي الوحيد: التنقل عبر Section state
import { useEffect, useState } from 'react';
import { api, setToken, getToken, Me } from '@/lib/client';
import { LoginScreen, SetupScreen } from '@/components/hrhub/login';
import { AppShell } from '@/components/hrhub/shell';
import { DashboardSection } from '@/components/hrhub/sections/dashboard';
import { EmployeesSection } from '@/components/hrhub/sections/employees';
import { DepartmentsSection, ShiftsSection, HolidaysSection, SalaryComponentsSection } from '@/components/hrhub/sections/simple-crud';
import { ContractsSection } from '@/components/hrhub/sections/contracts';
import { AlertsSection } from '@/components/hrhub/sections/alerts';
import { EndOfServiceSection } from '@/components/hrhub/sections/end-of-service';
import { DepartedSection, DeceasedSection } from '@/components/hrhub/sections/departed';
import { AttendanceLogsSection, DailyAttendanceSection } from '@/components/hrhub/sections/attendance';
import { LeavesSection } from '@/components/hrhub/sections/leaves';
import { DevicesSection } from '@/components/hrhub/sections/devices';
import { PayrollSection } from '@/components/hrhub/sections/payroll';
import { ReportsSection } from '@/components/hrhub/sections/reports';
import { ImportExportSection } from '@/components/hrhub/sections/import-export';
import { AuditSection, UsersSection, SettingsSection } from '@/components/hrhub/sections/admin';
import { Skeleton } from '@/components/ui/skeleton';

type Screen = 'loading' | 'setup' | 'login' | 'app';

export default function Page() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [section, setSection] = useState('dashboard');
  const [companyName, setCompanyName] = useState('شركة ADMS');

  // شاشة الإعداد الأول أو الدخول
  useEffect(() => {
    (async () => {
      try {
        const { setupNeeded } = await api<{ setupNeeded: boolean }>('/api/setup-needed', { skipAuth401: true });
        if (setupNeeded) { setScreen('setup'); return; }
        if (getToken()) {
          const meData = await api<Me>('/api/auth/me', { skipAuth401: true });
          setMe(meData);
          setScreen('app');
          api<{ companyName?: string }>('/api/settings', { skipAuth401: true }).then((s) => { if (s.companyName) setCompanyName(s.companyName); }).catch(() => {});
        } else {
          setScreen('login');
        }
      } catch {
        setScreen('login');
      }
    })();
  }, []);

  // تنظيف الجلسة عند 401 من أي مكان
  useEffect(() => {
    const onLogout = () => { setToken(null); setMe(null); setScreen('login'); };
    window.addEventListener('hrhub:logout', onLogout);
    return () => window.removeEventListener('hrhub:logout', onLogout);
  }, []);

  const onLogin = (user: unknown) => {
    api<Me>('/api/auth/me').then((m) => {
      setMe(m);
      setScreen('app');
      setSection('dashboard');
      // اسم الجهة من الإعدادات — للمستندات المطبوعة
      api<{ companyName?: string }>('/api/settings').then((s) => { if (s.companyName) setCompanyName(s.companyName); }).catch(() => {});
    }).catch(() => setScreen('login'));
    void user;
  };

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    setMe(null);
    setScreen('login');
  };

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-emerald-100/60">
        <div className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/30 animate-pulse">
            <span className="text-white font-black text-xl">HR</span>
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }

  if (screen === 'setup') return <SetupScreen onDone={() => setScreen('login')} />;
  if (screen === 'login' || !me) return <LoginScreen onLogin={onLogin} />;

  const can = me.can || {};

  return (
    <AppShell me={me} section={section} onNavigate={setSection} onLogout={logout}>
      {section === 'dashboard' && <DashboardSection />}
      {section === 'employees' && <EmployeesSection canWrite={!!can.employees} companyName={companyName} />}
      {section === 'departments' && <DepartmentsSection canWrite={!!can.departments} />}
      {section === 'contracts' && <ContractsSection canWrite={!!can.contracts} companyName={companyName} />}
      {section === 'alerts' && <AlertsSection canWrite={!!can.passports && !!can.vehicles && !!can.companyContracts} />}
      {section === 'end-of-service' && <EndOfServiceSection canWrite={!!can.settlements} companyName={companyName} />}
      {section === 'departed' && <DepartedSection canWrite={!!can.settlements} companyName={companyName} />}
      {section === 'deceased' && <DeceasedSection canWrite={!!can.settlements} companyName={companyName} />}
      {section === 'shifts' && <ShiftsSection canWrite={!!can.shifts} />}
      {section === 'attendance-logs' && <AttendanceLogsSection canWrite={!!can.attendanceLogs} isAdmin={me.role === 'admin'} />}
      {section === 'daily-attendance' && <DailyAttendanceSection canWrite={!!can.dailyAttendance} />}
      {section === 'leaves' && <LeavesSection canWrite={!!can.leaves} canApprove={!!can.leaveApprove || me.role === 'admin'} />}
      {section === 'holidays' && <HolidaysSection canWrite={!!can.holidays} />}
      {section === 'devices' && <DevicesSection canWrite={!!can.devices} />}
      {section === 'payroll' && <PayrollSection canWrite={!!can.payroll} role={me.role} companyName={companyName} />}
      {section === 'salary-components' && <SalaryComponentsSection canWrite={!!can.salaryComponents} />}
      {section === 'reports' && <ReportsSection />}
      {section === 'import' && <ImportExportSection canWrite={!!can.import} />}
      {section === 'audit' && <AuditSection />}
      {section === 'users' && <UsersSection />}
      {section === 'settings' && <SettingsSection />}
    </AppShell>
  );
}
