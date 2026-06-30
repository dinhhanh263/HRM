import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { navGroups } from '@/config/nav';
import logoUrl from '@/assets/logo.svg';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface SidebarProps {
  variant: 'desktop' | 'mobile';
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  variant,
  collapsed = false,
  onToggleCollapse,
  open = false,
  onClose,
}: SidebarProps) {
  const { t } = useTranslation('nav');
  const location = useLocation();
  const currentPath = location.pathname;
  const user = useAuthStore((s) => s.user);
  const { can } = usePermission();

  const onProbation = user?.employee?.contractType === 'PROBATION';
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          can(item.permission) && (!item.requiresProbationContract || onProbation)
      ),
    }))
    .filter((group) => group.items.length > 0);

  // Pick the single most-specific matching nav item so sibling routes that share
  // a prefix (e.g. /leave and /leave/balances) don't both light up.
  const matchableHrefs = visibleGroups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = matchableHrefs
    .filter((href) => currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

  // Mobile drawer is always expanded; only desktop can collapse.
  const isCollapsed = variant === 'desktop' && collapsed;

  const asideClass =
    variant === 'desktop'
      ? cn(
          'hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col bg-sidebar border-r border-border',
          'transition-[width] duration-200 motion-reduce:transition-none',
          isCollapsed ? 'w-[72px]' : 'w-60'
        )
      : cn(
          'md:hidden fixed left-0 top-0 bottom-0 z-50 w-60 flex flex-col bg-sidebar border-r border-border',
          'transition-transform duration-200 motion-reduce:transition-none',
          open ? 'translate-x-0' : '-translate-x-full'
        );

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={asideClass}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <Link to="/" className="flex items-center gap-3 overflow-hidden" onClick={onClose}>
            <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center shrink-0">
              <img src={logoUrl} alt="" aria-hidden="true" className="w-6 h-6" />
            </div>
            {!isCollapsed && (
              <span className="text-base font-semibold text-text-primary whitespace-nowrap">
                {t('appName')}
              </span>
            )}
          </Link>
          {variant === 'mobile' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={onClose}
              aria-label={t('sidebar.closeMenu')}
            >
              <X size={20} />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.titleKey} className={cn(groupIndex > 0 && 'mt-6')}>
              {!isCollapsed && (
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t(group.titleKey)}
                </p>
              )}
              {isCollapsed && groupIndex > 0 && <div className="mx-2 mb-2 h-px bg-border" />}

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);

                  const linkElement = (
                    <Link
                      to={item.href}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        isCollapsed && 'justify-center px-2',
                        active
                          ? 'bg-primary-light text-primary'
                          : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                      )}
                    >
                      <item.icon size={18} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
                      {!isCollapsed && <span>{t(item.labelKey)}</span>}
                    </Link>
                  );

                  if (isCollapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {t(item.labelKey)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{linkElement}</div>;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="shrink-0 border-t border-border p-3">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Avatar className="h-9 w-9 cursor-pointer">
                    <AvatarFallback className="bg-primary-light text-primary text-sm font-medium">
                      {user?.fullName ? getInitials(user.fullName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{user?.fullName}</p>
                <p className="text-xs opacity-70">{user?.role}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary-light text-primary text-sm font-medium">
                  {user?.fullName ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{user?.fullName}</p>
                <p className="text-xs text-text-muted truncate">{user?.role}</p>
              </div>
            </div>
          )}
        </div>

        {/* Collapse Toggle - desktop only */}
        {variant === 'desktop' && (
          <div className="shrink-0 border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? t('sidebar.expandAria') : t('sidebar.collapseAria')}
              className={cn(
                'w-full h-9 flex items-center gap-2 rounded-lg transition-colors duration-100',
                'text-text-muted hover:text-text-primary hover:bg-surface',
                isCollapsed ? 'justify-center' : 'justify-start px-3'
              )}
            >
              {isCollapsed ? (
                <ChevronRight size={18} strokeWidth={1.5} />
              ) : (
                <>
                  <ChevronLeft size={18} strokeWidth={1.5} />
                  <span className="text-sm">{t('sidebar.collapse')}</span>
                </>
              )}
            </Button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
