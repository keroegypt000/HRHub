'use client';

// القائمة الجانبية اليمنى + الهيدر + درج الموبايل — الأقسام الإدارية للمدير فقط
import { useState } from 'react';
import { Me } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Network, FileSignature, Clock4, Fingerprint, CalendarCheck2,
  Plane, Sparkles, MonitorSmartphone, Wallet, SlidersHorizontal, BarChart3,
  FileSpreadsheet, ScrollText, UserCog, Settings, LogOut, Menu,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  visibleFor?: string[]; // أدوار إضافية مسموحة (غير admin)
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { key: 'employees', label: 'الموظفون', icon: Users },
  { key: 'departments', label: 'الأقسام والمسميات', icon: Network },
  { key: 'contracts', label: 'العقود', icon: FileSignature },
  { key: 'shifts', label: 'الورديات', icon: Clock4 },
  { key: 'attendance-logs', label: 'سجل البصمة', icon: Fingerprint },
  { key: 'daily-attendance', label: 'الحضور اليومي', icon: CalendarCheck2 },
  { key: 'leaves', label: 'الإجازات', icon: Plane },
  { key: 'holidays', label: 'العطلات الرسمية', icon: Sparkles },
  { key: 'devices', label: 'الأجهزة', icon: MonitorSmartphone },
  { key: 'payroll', label: 'الرواتب', icon: Wallet, visibleFor: ['accountant'] },
  { key: 'salary-components', label: 'مكونات الراتب', icon: SlidersHorizontal, visibleFor: ['accountant'] },
  { key: 'reports', label: 'التقارير', icon: BarChart3 },
  { key: 'import', label: 'الاستيراد والتصدير', icon: FileSpreadsheet },
  { key: 'audit', label: 'سجل التدقيق', icon: ScrollText, adminOnly: true },
  { key: 'users', label: 'المستخدمون', icon: UserCog, adminOnly: true },
  { key: 'settings', label: 'الإعدادات', icon: Settings, adminOnly: true },
];

function NavList({ me, current, onNavigate }: { me: Me; current: string; onNavigate: (k: string) => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {NAV_ITEMS.filter((item) => {
        if (item.adminOnly && me.role !== 'admin') return false;
        if (['payroll', 'salary-components'].includes(item.key)) {
          return me.role === 'admin' || me.role === 'accountant';
        }
        return true;
      }).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-right',
              current === item.key
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <div className="border-t border-white/10 p-3 space-y-2">
      <div className="flex items-center gap-3 px-2">
        <div className="h-9 w-9 rounded-full bg-emerald-500/30 flex items-center justify-center text-sm font-bold text-white">
          {me.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{me.name}</p>
          <p className="text-xs text-sidebar-foreground/60">
            {({ admin: 'مدير النظام', hr: 'موارد بشرية', accountant: 'محاسب', supervisor: 'مشرف', viewer: 'مشاهد' }[me.role] || me.role)}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/70 hover:text-white" onClick={onLogout} title="تسجيل الخروج">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  me, section, onNavigate, onLogout, children,
}: {
  me: Me;
  section: string;
  onNavigate: (k: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentLabel = NAV_ITEMS.find((n) => n.key === section)?.label || '';

  const go = (k: string) => {
    onNavigate(k);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="flex flex-1">
        {/* القائمة الجانبية — ثابتة يمين الديسكتوب */}
        <aside className="hidden lg:flex flex-col w-64 bg-sidebar shrink-0 sticky top-0 h-screen">
          <div className="flex items-center gap-3 p-4 border-b border-white/10">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-1 ring-white/25 shadow-lg shadow-indigo-950/40">
              <span className="text-lg font-black leading-none text-white">A</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold leading-tight tracking-wide text-white">ADMS FOR HR MANAGMENT</p>
              <p className="truncate text-xs text-sidebar-foreground/60">إدارة الموارد البشرية</p>
            </div>
          </div>
          <NavList me={me} current={section} onNavigate={go} />
          <SidebarFooter me={me} onLogout={onLogout} />
        </aside>

        {/* المحتوى */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
            {/* درج الموبايل */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-sidebar p-0 w-72" dir="rtl">
                <SheetTitle className="sr-only">القائمة</SheetTitle>
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 p-4 border-b border-white/10">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-1 ring-white/25">
                      <span className="text-base font-black leading-none text-white">A</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-extrabold leading-tight tracking-wide text-white">ADMS FOR HR MANAGMENT</p>
                      <p className="truncate text-xs text-sidebar-foreground/60">إدارة الموارد البشرية</p>
                    </div>
                  </div>
                  <NavList me={me} current={section} onNavigate={go} />
                  <SidebarFooter me={me} onLogout={() => { setMobileOpen(false); onLogout(); }} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg truncate">{currentLabel}</h2>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 hover:bg-red-50 hover:text-red-700 hover:border-red-200" onClick={onLogout}>
              <LogOut className="h-4 w-4" /> خروج
            </Button>
          </header>

          <main className="flex-1 p-4 pb-16 max-w-full">{children}</main>

          <footer className="mt-auto border-t py-3 px-4 text-center text-xs text-muted-foreground bg-background">
            ADMS FOR HR MANAGMENT — إدارة الموارد البشرية والحضور والرواتب · دولة الكويت · العملة: دينار كويتي (د.ك)
          </footer>
        </div>
      </div>
    </div>
  );
}
