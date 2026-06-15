import { useTranslation } from 'react-i18next';
import { Moon } from 'lucide-react';
import type { TimesheetSummaryDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface SummaryCardProps {
  summary: TimesheetSummaryDto | undefined;
  isLoading: boolean;
  monthLabel: string;
}

/**
 * Payroll-grade month summary surface — the visible face of the
 * GET /timesheet/summary contract. Shows the day-classification partition
 * (working days = present + paid leave + unpaid leave + absent) plus the
 * approved-overtime breakdown grouped by category, night and snapshot
 * multiplier.
 */
export function SummaryCard({ summary, isLoading, monthLabel }: SummaryCardProps) {
  const { t } = useTranslation('timesheet');

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  const stats: { key: string; label: string; value: number; tone?: 'muted' | 'danger' }[] = [
    { key: 'workingDays', label: t('summary.workingDays'), value: summary?.workingDaysInPeriod ?? 0 },
    { key: 'present', label: t('summary.presentDays'), value: summary?.daysPresent ?? 0 },
    { key: 'absent', label: t('summary.daysAbsent'), value: summary?.daysAbsent ?? 0, tone: 'danger' },
    { key: 'paidLeave', label: t('summary.paidLeave'), value: summary?.paidLeaveDays ?? 0 },
    { key: 'unpaidLeave', label: t('summary.unpaidLeave'), value: summary?.unpaidLeaveDays ?? 0 },
    { key: 'holidays', label: t('summary.holidays'), value: summary?.holidayCount ?? 0, tone: 'muted' },
  ];

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-text-primary">
          {t('summary.title', { month: monthLabel })}
        </p>
        <span className="text-xs text-text-muted tabular-nums">
          {t('summary.workedHours')}:{' '}
          <span className="font-semibold text-text-primary">{summary?.totalWorkedHours ?? 0}h</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {s.label}
            </p>
            <p
              className={
                'text-xl font-bold tabular-nums mt-0.5 ' +
                (s.tone === 'danger'
                  ? 'text-danger'
                  : s.tone === 'muted'
                    ? 'text-text-muted'
                    : 'text-text-primary')
              }
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {t('summary.overtimeTitle')}
        </p>
        {(summary?.overtime.length ?? 0) === 0 ? (
          <p className="text-xs text-text-muted">{t('summary.noOvertime')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {summary?.overtime.map((ot, i) => (
              <li
                key={`${ot.category}-${ot.night}-${ot.multiplier}-${i}`}
                className="flex items-center justify-between gap-2 bg-surface-alt px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">
                    {t(`overtime.category.${ot.category}`)}
                  </span>
                  {ot.night && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Moon className="size-3" />
                      {t('overtime.night')}
                    </Badge>
                  )}
                  <span className="text-[11px] text-text-muted tabular-nums">×{ot.multiplier}</span>
                </div>
                <span className="text-xs font-semibold tabular-nums text-text-primary">
                  {ot.hours}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
