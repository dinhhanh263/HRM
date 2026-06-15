import { useTranslation } from 'react-i18next';
import type { PermissionCatalogGroup } from '@hrm/shared';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Clock,
  CalendarOff,
  Banknote,
  UserCog,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  employees: Users,
  departments: Building2,
  positions: Briefcase,
  timesheet: Clock,
  leave: CalendarOff,
  payroll: Banknote,
  users: UserCog,
  roles: ShieldCheck,
  settings: Settings,
};

interface PermissionMatrixProps {
  catalog: PermissionCatalogGroup[];
  selected: Set<string>;
  onChange?: (next: Set<string>) => void;
  readOnly?: boolean;
}

export function PermissionMatrix({ catalog, selected, onChange, readOnly }: PermissionMatrixProps) {
  const { t } = useTranslation('permission');

  function toggleKey(key: string) {
    if (readOnly || !onChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function toggleResource(group: PermissionCatalogGroup, allSelected: boolean) {
    if (readOnly || !onChange) return;
    const next = new Set(selected);
    for (const a of group.actions) {
      if (allSelected) next.delete(a.key);
      else next.add(a.key);
    }
    onChange(next);
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {catalog.map((group) => {
        const Icon = RESOURCE_ICONS[group.resource] ?? ShieldCheck;
        const selectedCount = group.actions.filter((a) => selected.has(a.key)).length;
        const allSelected = selectedCount === group.actions.length && group.actions.length > 0;

        return (
          <div key={group.resource} className="bg-surface">
            {/* Resource header row */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-alt/50">
              <div className="size-7 rounded-md bg-primary-light text-primary flex items-center justify-center shrink-0">
                <Icon size={15} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-text-primary flex-1">
                {t(`resources.${group.resource}`, group.resource)}
              </span>
              <span className="text-xs text-text-muted tabular-nums shrink-0">
                {selectedCount}/{group.actions.length}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => toggleResource(group, allSelected)}
                  className="text-xs font-medium text-primary hover:underline shrink-0"
                >
                  {allSelected ? t('matrix.clearRow') : t('matrix.selectRow')}
                </button>
              )}
            </div>

            {/* Action toggles */}
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {group.actions.map((a) => {
                const checked = selected.has(a.key);
                const label = t(`actions.${a.action}`, a.action);
                return (
                  <button
                    key={a.key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={`${t(`resources.${group.resource}`, group.resource)} — ${label}`}
                    disabled={readOnly}
                    onClick={() => toggleKey(a.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-100',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      checked
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border bg-surface text-text-secondary',
                      readOnly
                        ? 'cursor-default opacity-90'
                        : 'cursor-pointer hover:border-primary/60 hover:text-text-primary'
                    )}
                  >
                    <span
                      className={cn(
                        'size-3.5 rounded-[4px] border flex items-center justify-center shrink-0',
                        checked ? 'border-primary bg-primary' : 'border-border-strong bg-transparent'
                      )}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="size-2.5 text-primary-foreground"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
