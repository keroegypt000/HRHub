'use client';

// القائمة الجانبية اليمنى + الهيدر + درج الموبايل
// الملاحة في مجموعات منسدلة لتقليل الازدحام + جرس تنبيهات النفاذ في الهيدر
import { useCallback, useEffect, useState } from 'react';
import { Me, api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Network, FileSignature, Clock4, Fingerprint, CalendarCheck2,
  Plane, Sparkles, MonitorSmartphone, Wallet, SlidersHorizontal, BarChart3,
  FileSpreadsheet, ScrollText, UserCog, Settings, LogOut, Menu, ChevronDown,
  BellRing, Hourglass, Flower2, UserMinus, CreditCard, ClipboardList,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  visibleFor?: string[]; // أدوار إضافية مسموحة (غير admin)
}

export interface NavGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

/** عنصر يظهر لكل الأدوار */
const visible = (item: NavItem, role: string): boolean => {
  if (item.adminOnly && role !== 'admin') return false;
  if (['payroll', 'salary-components'].includes(item.key)) {
    return role === 'admin' || role === 'accountant';
  }
  return true;
};

export const STANDALONE: NavItem = { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard };

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'employees',
    label: 'الموظفون والعقود',
    icon: Users,
    items: [
      { key: 'employees', label: 'الموظفون', icon: Users },
      { key: 'departments', label: 'الأقسام والمسميات', icon: Network },
      { key: 'contracts', label: 'عقود الموظفين', icon: FileSignature },
      { key: 'passports', label: 'الجوازات', icon: Plane },
      { key: 'iqamas', label: 'الإقامات', icon: CreditCard },
    ],
  },
  {
    key: 'attendance',
    label: 'الحضور والانصراف',
    icon: Fingerprint,
    items: [
      { key: 'daily-attendance', label: 'الحضور اليومي', icon: CalendarCheck2 },
      { key: 'attendance-logs', label: 'سجل البصمة', icon: Fingerprint },
      { key: 'shifts', label: 'الورديات', icon: Clock4 },
      { key: 'leaves', label: 'الإجازات', icon: Plane },
      { key: 'holidays', label: 'العطلات الرسمية', icon: Sparkles },
      { key: 'devices', label: 'الأجهزة', icon: MonitorSmartphone },
    ],
  },
  {
    key: 'requests',
    label: 'الطلبات والموافقات',
    icon: ClipboardList,
    items: [
      { key: 'requests', label: 'الطلبات والموافقات', icon: ClipboardList },
    ],
  },
  {
    key: 'payroll',
    label: 'الرواتب ونهاية الخدمة',
    icon: Wallet,
    items: [
      { key: 'payroll', label: 'الرواتب والقسائم', icon: Wallet, visibleFor: ['accountant'] },
      { key: 'salary-components', label: 'مكونات الراتب', icon: SlidersHorizontal, visibleFor: ['accountant'] },
      { key: 'end-of-service', label: 'نهاية الخدمة', icon: Hourglass },
    ],
  },
  {
    key: 'alerts',
    label: 'التنبيهات والمستحقات',
    icon: BellRing,
    items: [
      { key: 'alerts', label: 'التنبيهات والنفاذ', icon: BellRing },
      { key: 'departed', label: 'المنصرفون والمستحقات', icon: UserMinus },
      { key: 'deceased', label: 'الموظفون المتوفون', icon: Flower2 },
    ],
  },
  {
    key: 'system',
    label: 'التقارير والنظام',
    icon: BarChart3,
    items: [
      { key: 'reports', label: 'التقارير', icon: BarChart3 },
      { key: 'import', label: 'الاستيراد والتصدير', icon: FileSpreadsheet },
      { key: 'audit', label: 'سجل التدقيق', icon: ScrollText, adminOnly: true },
      { key: 'users', label: 'المستخدمون', icon: UserCog, adminOnly: true },
      { key: 'settings', label: 'الإعدادات', icon: Settings, adminOnly: true },
    ],
  },
];

/** كل عناصر الملاحة المتاحة لدور معين — للعثور على عنوان القسم الحالي */
export function findNavItem(key: string): { item: NavItem; group?: NavGroup } | null {
  if (STANDALONE.key === key) return { item: STANDALONE };
  for (const g of NAV_GROUPS) {
    for (const it of g.items) if (it.key === key) return { item: it, group: g };
  }
  return null;
}

/** جرس تنبيهات النفاذ — عدد العناصر القريبة من الانتهاء أو المنتهية */
function AlertsBell({ onNavigate }: { onNavigate: (k: string) => void }) {
  const [total, setTotal] = useState<number | null>(null);

  const load = useCallback(() => {
    api<{ total: number }>('/api/alerts', { skipAuth401: true })
      .then((d) => setTotal(d.total))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000); // تحديث كل 5 دقائق
    window.addEventListener('hrhub:refresh', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('hrhub:refresh', load);
    };
  }, [load]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="relative gap-1.5"
      onClick={() => onNavigate('alerts')}
      title="تنبيهات النفاذ: جوازات وإقامات وسيارات وعقود"
    >
      <BellRing className={cn('h-4 w-4', total ? 'text-amber-600' : 'text-muted-foreground')} />
      <span className="hidden sm:inline">التنبيهات</span>
      {!!total && (
        <span className="absolute -top-1.5 -start-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </Button>
  );
}

function NavList({ me, current, onNavigate }: { me: Me; current: string; onNavigate: (k: string) => void }) {
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => visible(it, me.role)) })).filter((g) => g.items.length > 0);

  // المجموعة المفتوحة: تجاوز يدوي بالكليك، وإلا مجموعة القسم الحالي تلقائيًا
  const [manualOpen, setManualOpen] = useState<string | null>(null);
  const currentGroupKey = groups.find((gr) => gr.items.some((it) => it.key === current))?.key || '';
  const openKey = manualOpen !== null ? manualOpen : currentGroupKey;

  const toggle = (key: string) => setManualOpen(openKey === key ? '' : key);
  const goItem = (k: string) => {
    setManualOpen(null);
    onNavigate(k);
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {/* لوحة التحكم — عنصر مستقل */}
      <NavButton
        icon={STANDALONE.icon}
        label={STANDALONE.label}
        active={current === STANDALONE.key}
        onClick={() => onNavigate(STANDALONE.key)}
      />

      {groups.map((g) => {
        const GroupIcon = g.icon;
        const isActive = g.items.some((it) => it.key === current);
        const isOpen = openKey === g.key;
        return (
          <div key={g.key}>
            <button
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-right',
                isActive && !isOpen
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-sidebar-foreground/90 hover:bg-white/10 hover:text-white'
              )}
            >
              <GroupIcon className="h-4.5 w-4.5 shrink-0" />
              <span className="flex-1">{g.label}</span>
              {isActive && !isOpen && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />}
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
              <div className="mt-0.5 mb-1 ms-5 ps-3 border-s border-white/15 space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => goItem(item.key)}
                      className={cn(
                        'w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors text-right',
                        current === item.key
                          ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                          : 'text-sidebar-foreground/75 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-right',
        active
          ? 'bg-emerald-600 text-white shadow-sm font-semibold'
          : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-white'
      )}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" />
      <span>{label}</span>
    </button>
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

function BrandBox({ small = false }: { small?: boolean }) {
  return (
    <>
      <div className={cn(
        'shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center ring-1 ring-white/25 shadow-lg shadow-emerald-950/40',
        small ? 'h-9 w-9' : 'h-10 w-10'
      )}>
        <span className={cn('font-black leading-none text-white', small ? 'text-base' : 'text-lg')}>A</span>
      </div>
      <div className="min-w-0">
        <p className={cn('truncate font-extrabold leading-tight tracking-wide text-white', small ? 'text-[12px]' : 'text-[13px]')}>ADMS FOR HR MANAGMENT</p>
        <p className="truncate text-xs text-sidebar-foreground/60">إدارة الموارد البشرية</p>
      </div>
    </>
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
  const currentLabel = findNavItem(section)?.item.label || '';

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
            <BrandBox />
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
                    <BrandBox small />
                  </div>
                  <NavList me={me} current={section} onNavigate={go} />
                  <SidebarFooter me={me} onLogout={() => { setMobileOpen(false); onLogout(); }} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg truncate">{currentLabel}</h2>
            </div>
            <AlertsBell onNavigate={go} />
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
