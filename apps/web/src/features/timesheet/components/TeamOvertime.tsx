import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useTeamOvertime } from '../hooks/useOvertime';
import { OvertimeList } from './OvertimeList';

type ReviewScope = 'team' | 'all';

interface TeamOvertimeProps {
  month: string;
}

export function TeamOvertime({ month }: TeamOvertimeProps) {
  const { t } = useTranslation('timesheet');
  const { can } = usePermission();
  const canViewAll = can('timesheet:configure');
  const canReview = can('timesheet:approve');
  const [scope, setScope] = useState<ReviewScope>('team');

  const { data, isLoading } = useTeamOvertime(scope, { month });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{t('overtime.teamTitle')}</h2>
          <p className="text-xs text-text-muted mt-0.5">{t('overtime.teamSubtitle')}</p>
        </div>
        {canViewAll && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt p-0.5 w-fit">
            {(['team', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={cn(
                  'h-7 px-3 rounded text-xs font-medium transition-colors',
                  scope === s
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {t(`team.scope.${s}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      <OvertimeList
        records={data?.data ?? []}
        isLoading={isLoading}
        showEmployee
        actionMode={canReview ? 'review' : undefined}
      />
    </div>
  );
}
