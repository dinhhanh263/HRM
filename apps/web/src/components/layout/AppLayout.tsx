import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Menu, User, Settings, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/features/auth/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/ui.store';
import { useThemeStore } from '@/stores/theme.store';
import { usePublicSettings } from '@/features/settings/hooks/useSettings';
import { Sidebar } from './Sidebar';
import { PreferencesMenu } from './PreferencesMenu';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

const pageTitleKeys: Record<string, string> = {
  '/': 'titles.dashboard',
  '/employees': 'titles.employees',
  '/employees/new': 'titles.employeeNew',
  '/departments': 'titles.departments',
  '/positions': 'titles.positions',
  '/recruitment': 'titles.recruitment',
  '/timesheet': 'titles.timesheet',
  '/leave': 'titles.leave',
  '/payroll': 'titles.payroll',
  '/assets': 'titles.assets',
  '/settings': 'titles.settings',
  '/sales': 'titles.salesDashboard',
  '/sales/customers': 'titles.salesCustomers',
  '/sales/companies': 'titles.salesCompanies',
  '/sales/pipeline': 'titles.salesPipeline',
  '/sales/products': 'titles.salesProducts',
  '/sales/tasks': 'titles.salesTasks',
  '/settings/sales': 'titles.salesSettings',
  '/finance': 'titles.financeDashboard',
  '/finance/accounts': 'titles.fundAccounts',
  '/finance/transactions': 'titles.cashTransactions',
  '/finance/categories': 'titles.financeCategories',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AppLayout() {
  const { t } = useTranslation('nav');
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // SPEC-036: ngôn ngữ mặc định của tenant áp cho user chưa tự chọn ngôn ngữ.
  const { data: publicSettings } = usePublicSettings();
  const applyTenantDefaultLanguage = useThemeStore((s) => s.applyTenantDefaultLanguage);
  useEffect(() => {
    const defaultLanguage = publicSettings?.regional.defaultLanguage;
    if (defaultLanguage) applyTenantDefaultLanguage(defaultLanguage);
  }, [publicSettings, applyTenantDefaultLanguage]);

  const currentPath = location.pathname;
  const pageTitleKey =
    pageTitleKeys[currentPath] || pageTitleKeys[currentPath.split('/').slice(0, 2).join('/')];
  const pageTitle = pageTitleKey ? t(pageTitleKey) : t('appName');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar - collapsible */}
      <Sidebar
        variant="desktop"
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-text-primary/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar - slide-in drawer */}
      <Sidebar variant="mobile" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* ===== MAIN CONTENT ===== */}
      <div
        id="main-content"
        className={cn(
          'flex flex-col min-h-screen overflow-hidden transition-[margin,width] duration-200 motion-reduce:transition-none',
          'w-full md:w-[calc(100%-240px)] md:ml-60',
          sidebarCollapsed && 'md:w-[calc(100%-72px)] md:ml-[72px]'
        )}
      >
        {/* Header - 56px, glass */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur-md">
          {/* Left: Mobile Menu + Breadcrumb */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t('header.openMenu')}
            >
              <Menu size={20} />
            </Button>
            <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
                {t('header.home')}
              </Link>
              {currentPath !== '/' && (
                <>
                  <ChevronRight size={14} className="text-text-muted" />
                  <span className="text-text-primary font-medium">{pageTitle}</span>
                </>
              )}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            {/* Quick search / command palette trigger */}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              aria-label={t('commandPalette.trigger')}
              className="hidden sm:flex items-center gap-2 h-9 px-3 mr-1 rounded-md border border-border bg-surface-alt/60 text-text-muted hover:text-text-primary hover:bg-surface-alt transition-colors"
            >
              <Search size={15} strokeWidth={1.5} />
              <span className="text-sm">{t('commandPalette.trigger')}</span>
              <kbd className="ml-2 hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 text-[10px] font-medium text-text-muted">
                ⌘K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 sm:hidden"
              onClick={() => setCmdOpen(true)}
              aria-label={t('commandPalette.trigger')}
            >
              <Search size={18} />
            </Button>

            {/* Preferences (language + theme + appearance) */}
            <PreferencesMenu />

            {/* Notifications */}
            <NotificationBell />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 gap-2 px-2 ml-1">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary-light text-primary text-xs font-medium">
                      {user?.fullName ? getInitials(user.fullName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">
                    {user?.fullName?.split(' ').pop()}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-text-muted">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/account')}>
                  <User size={16} className="mr-2" />
                  {t('userMenu.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/account?tab=security')}>
                  <Settings size={16} className="mr-2" />
                  {t('userMenu.account')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} className="text-danger">
                  <LogOut size={16} className="mr-2" />
                  {t('userMenu.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 bg-background">
          <Outlet />
        </main>
      </div>

      {/* Command palette (⌘K) */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
