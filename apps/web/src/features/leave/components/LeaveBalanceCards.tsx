import { useTranslation } from 'react-i18next';
import type { LeaveBalanceDto } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarOff } from 'lucide-react';
import { formatDays } from '../utils';

interface LeaveBalanceCardsProps {
  balances: LeaveBalanceDto[];
  isLoading?: boolean;
}

export function LeaveBalanceCards({ balances, isLoading }: LeaveBalanceCardsProps) {
  const { t } = useTranslation('leave');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 bg-surface rounded-xl border border-border">
        <div className="size-12 rounded-full bg-background flex items-center justify-center mb-3">
          <CalendarOff className="size-5 text-text-muted" />
        </div>
        <p className="text-sm text-text-muted">{t('balances.empty')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {balances.map((b) => {
        const color = b.colorHex || '#4A9EBF';
        return (
          <div
            key={b.leaveTypeId}
            className="bg-surface rounded-xl border border-border p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <p className="text-sm font-medium text-text-primary truncate">
                  {b.leaveTypeName}
                </p>
              </div>
              {!b.paid && (
                <span className="text-[11px] text-text-muted shrink-0">
                  {t('balances.unpaid')}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums text-text-primary">
                {formatDays(b.remaining)}
              </span>
              <span className="text-xs text-text-muted">
                / {formatDays(b.allocated)} {t('balances.days')}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3 text-[11px] text-text-secondary">
              <span className="tabular-nums">
                {t('balances.used')}: <span className="font-medium">{formatDays(b.used)}</span>
              </span>
              <span className="tabular-nums">
                {t('balances.pending')}:{' '}
                <span className="font-medium text-amber-600">{formatDays(b.pending)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
