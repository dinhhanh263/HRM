import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Search,
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  UserSearch,
  CalendarClock,
  Clock,
  CalendarOff,
  Banknote,
  Package,
  ShieldCheck,
  Settings,
  Plus,
  Gauge,
  Activity,
  CornerDownLeft,
} from 'lucide-react';
import type { PermissionKey } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';

type CommandGroup = 'actions' | 'navigation';

interface Command {
  id: string;
  group: CommandGroup;
  /** i18n key in the 'nav' namespace. */
  labelKey: string;
  icon: React.ElementType;
  to: string;
  permission: PermissionKey;
}

// Recruitment-focused quick actions surface first; navigation mirrors the sidebar.
const COMMANDS: Command[] = [
  { id: 'create-job', group: 'actions', labelKey: 'commandPalette.actions.createJob', icon: Plus, to: '/recruitment?new=1', permission: 'recruitment:job_create' },
  { id: 'add-candidate', group: 'actions', labelKey: 'commandPalette.actions.addCandidate', icon: Plus, to: '/recruitment/candidates?new=1', permission: 'recruitment:candidate_create' },
  { id: 'find-candidates', group: 'actions', labelKey: 'commandPalette.actions.findCandidates', icon: UserSearch, to: '/recruitment/candidates', permission: 'recruitment:candidate_view' },
  { id: 'my-interviews', group: 'actions', labelKey: 'commandPalette.actions.myInterviews', icon: CalendarClock, to: '/recruitment/my-interviews', permission: 'recruitment:scorecard_submit' },

  { id: 'nav-dashboard', group: 'navigation', labelKey: 'items.dashboard', icon: LayoutDashboard, to: '/', permission: 'dashboard:view' },
  { id: 'nav-employees', group: 'navigation', labelKey: 'items.employees', icon: Users, to: '/employees', permission: 'employees:view' },
  { id: 'nav-departments', group: 'navigation', labelKey: 'items.departments', icon: Building2, to: '/departments', permission: 'departments:view' },
  { id: 'nav-positions', group: 'navigation', labelKey: 'items.positions', icon: Briefcase, to: '/positions', permission: 'positions:view' },
  { id: 'nav-recruitment', group: 'navigation', labelKey: 'items.recruitment', icon: UserSearch, to: '/recruitment', permission: 'recruitment:job_view' },
  { id: 'nav-candidates', group: 'navigation', labelKey: 'items.candidates', icon: Users, to: '/recruitment/candidates', permission: 'recruitment:candidate_view' },
  { id: 'nav-timesheet', group: 'navigation', labelKey: 'items.timesheet', icon: Clock, to: '/timesheet', permission: 'timesheet:view' },
  { id: 'nav-leave', group: 'navigation', labelKey: 'items.leave', icon: CalendarOff, to: '/leave', permission: 'leave:view' },
  { id: 'nav-payroll', group: 'navigation', labelKey: 'items.payroll', icon: Banknote, to: '/payroll', permission: 'payroll:view' },
  { id: 'nav-kpi', group: 'navigation', labelKey: 'items.kpi', icon: Gauge, to: '/kpi', permission: 'kpi:enter' },
  { id: 'nav-mykpi', group: 'navigation', labelKey: 'items.myKpi', icon: Activity, to: '/kpi/me', permission: 'kpi:view' },
  { id: 'nav-kpi-frameworks', group: 'navigation', labelKey: 'items.kpiFrameworks', icon: Gauge, to: '/settings/kpi', permission: 'kpi:config' },
  { id: 'nav-assets', group: 'navigation', labelKey: 'items.assets', icon: Package, to: '/assets', permission: 'assets:view' },
  { id: 'nav-roles', group: 'navigation', labelKey: 'items.roles', icon: ShieldCheck, to: '/settings/roles', permission: 'roles:view' },
  { id: 'nav-settings', group: 'navigation', labelKey: 'items.settings', icon: Settings, to: '/settings', permission: 'settings:view' },
];

const GROUP_ORDER: CommandGroup[] = ['actions', 'navigation'];

/** Diacritic- and case-insensitive normalization (matches the smart-search rule). */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const { can } = usePermission();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const allowed = useMemo(() => COMMANDS.filter((c) => can(c.permission)), [can]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return allowed;
    return allowed.filter((c) => normalize(t(c.labelKey)).includes(q));
  }, [allowed, query, t]);

  // Keep the active row in range as the result set shrinks.
  useEffect(() => {
    setActiveIndex((i) => (i >= filtered.length ? 0 : i));
  }, [filtered.length]);

  function run(cmd: Command) {
    onOpenChange(false);
    navigate(cmd.to);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) run(cmd);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-text-primary/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-label={t('commandPalette.title')}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2',
            'overflow-hidden rounded-xl border border-border bg-surface shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 motion-reduce:animate-none'
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {t('commandPalette.title')}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t('commandPalette.placeholder')}
          </DialogPrimitive.Description>

          {/* Search */}
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search size={16} className="shrink-0 text-text-muted" strokeWidth={1.5} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={t('commandPalette.placeholder')}
              aria-label={t('commandPalette.placeholder')}
              className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                {t('commandPalette.empty')}
              </p>
            ) : (
              GROUP_ORDER.map((group) => {
                const items = filtered.filter((c) => c.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-1 last:mb-0">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {t(`commandPalette.groups.${group}`)}
                    </p>
                    {items.map((cmd) => {
                      const index = filtered.indexOf(cmd);
                      const active = index === activeIndex;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => run(cmd)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-100',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                            active
                              ? 'bg-primary-light text-primary'
                              : 'text-text-secondary hover:bg-surface-alt'
                          )}
                        >
                          <cmd.icon size={16} strokeWidth={1.5} className="shrink-0" />
                          <span className="flex-1 truncate">{t(cmd.labelKey)}</span>
                          {active && (
                            <CornerDownLeft size={13} className="shrink-0 text-text-muted" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
