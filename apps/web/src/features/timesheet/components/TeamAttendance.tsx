import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Pencil } from 'lucide-react';
import type { AttendanceRecordDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useTeamAttendance } from '../hooks/useAttendance';
import { AdjustAttendanceSheet } from './AdjustAttendanceSheet';
import { formatDate, formatTime } from '../utils';

type ReviewScope = 'team' | 'all';

interface TeamAttendanceProps {
  month: string;
}

export function TeamAttendance({ month }: TeamAttendanceProps) {
  const { t, i18n } = useTranslation('timesheet');
  const { can } = usePermission();
  const canViewAll = can('timesheet:configure');
  const [scope, setScope] = useState<ReviewScope>('team');
  const [editing, setEditing] = useState<AttendanceRecordDto | null>(null);

  const { data: records, isLoading } = useTeamAttendance(scope, month);

  return (
    <div className="space-y-3">
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

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (records?.length ?? 0) === 0 ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
              <CalendarClock className="size-5 text-text-muted" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">{t('team.empty.title')}</h3>
            <p className="text-xs text-text-muted max-w-xs">{t('team.empty.desc')}</p>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-alt border-b border-border">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.employee')}
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.date')}
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.checkIn')}
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.checkOut')}
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.hours')}
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t('team.col.source')}
                </th>
                <th className="w-12 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records?.map((r) => (
                <tr key={r.id} className="group hover:bg-surface-alt/50 transition-colors">
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
                  <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                    {formatDate(r.workDate, i18n.language)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                    {formatTime(r.checkInAt, i18n.language)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                    {formatTime(r.checkOutAt, i18n.language)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                    {r.workedHours != null ? `${r.workedHours}h` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        r.source === 'MANUAL_ADJUST' &&
                          'border-primary/30 text-primary bg-primary/5',
                      )}
                    >
                      {t(r.source === 'MANUAL_ADJUST' ? 'team.source.adjust' : 'team.source.self')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('team.adjustAction')}
                      className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdjustAttendanceSheet
        record={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}
