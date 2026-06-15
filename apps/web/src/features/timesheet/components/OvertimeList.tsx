import { useTranslation } from 'react-i18next';
import { Moon, Timer } from 'lucide-react';
import type { OvertimeRequestDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '../utils';
import { OvertimeRowActions } from './OvertimeRowActions';

interface OvertimeListProps {
  records: OvertimeRequestDto[];
  isLoading: boolean;
  /** Show the employee column (reviewer scope). */
  showEmployee?: boolean;
  /** Per-row actions: 'review' = approve/reject (reviewer); 'mine' = cancel (owner). */
  actionMode?: 'review' | 'mine';
}

const STATUS_BADGE: Record<OvertimeRequestDto['status'], BadgeStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'terminated',
  RETURNED: 'returned',
};

export function OvertimeList({
  records,
  isLoading,
  showEmployee = false,
  actionMode,
}: OvertimeListProps) {
  const { t, i18n } = useTranslation('timesheet');

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (records.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <Timer className="size-5 text-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">{t('overtime.empty.title')}</h3>
          <p className="text-xs text-text-muted max-w-xs">{t('overtime.empty.desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-alt border-b border-border">
            {showEmployee && <Th>{t('overtime.col.employee')}</Th>}
            <Th>{t('overtime.col.date')}</Th>
            <Th align="right">{t('overtime.col.hours')}</Th>
            <Th>{t('overtime.col.category')}</Th>
            <Th>{t('overtime.col.reason')}</Th>
            <Th>{t('overtime.col.status')}</Th>
            {actionMode && <Th align="right">{t('overtime.col.actions')}</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-surface-alt/50 transition-colors">
              {showEmployee && (
                <td className="px-4 py-2.5">
                  <p className="font-medium text-text-primary leading-none">
                    {r.employee?.fullName ?? '—'}
                  </p>
                  {r.employee?.employeeCode && (
                    <p className="text-[11px] text-text-muted mt-1 tabular-nums">
                      {r.employee.employeeCode}
                    </p>
                  )}
                </td>
              )}
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                {formatDate(r.workDate, i18n.language)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {r.night && <Moon className="size-3.5 text-primary" aria-label={t('overtime.night')} />}
                  {r.hours}h
                </span>
              </td>
              <td className="px-4 py-2.5">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    r.category === 'OT_HOLIDAY' && 'border-danger/30 text-danger bg-danger/5',
                    r.category === 'OT_WEEKEND' && 'border-primary/30 text-primary bg-primary/5',
                  )}
                >
                  {t(`overtime.category.${r.category}`)}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-text-secondary max-w-48 truncate" title={r.reason ?? ''}>
                {r.reason || '—'}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={STATUS_BADGE[r.status]} label={t(`overtime.status.${r.status}`)} />
              </td>
              {actionMode && (
                <td className="px-4 py-2.5 text-right">
                  <OvertimeRowActions record={r} mode={actionMode} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}
