import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttendanceRecordDto, TimesheetPolicyDto, HolidayDto } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { buildCalendar, policyWorkdays, type DayStatus } from '../utils';

interface AttendanceCalendarProps {
  month: string;
  records: AttendanceRecordDto[];
  policy?: TimesheetPolicyDto;
  holidays: HolidayDto[];
}

// Monday-first weekday labels, keyed to i18n.
const WEEKDAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'] as const;

const STATUS_DOT: Record<DayStatus, string> = {
  present: 'bg-green-500',
  absent: 'bg-danger',
  weekend: 'bg-text-muted/30',
  holiday: 'bg-primary',
  upcoming: 'bg-transparent',
  leave: 'bg-blue-500',
};

export function AttendanceCalendar({ month, records, policy, holidays }: AttendanceCalendarProps) {
  const { t } = useTranslation('timesheet');

  const days = useMemo(() => {
    const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
    return buildCalendar({
      month,
      records,
      workdays: policyWorkdays(policy),
      holidays: holidayMap,
    });
  }, [month, records, policy, holidays]);

  return (
    <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_KEYS.map((k) => (
          <div
            key={k}
            className="text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted py-1"
          >
            {t(`policy.dayShort.${k}`)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div
            key={day.date}
            title={day.holidayName ?? undefined}
            className={cn(
              'relative aspect-square rounded-lg border p-1.5 flex flex-col',
              day.inMonth ? 'border-border' : 'border-transparent opacity-40',
              day.status === 'present' && 'bg-green-50 dark:bg-green-950/40',
              day.status === 'holiday' && 'bg-primary/5',
              day.status === 'absent' && 'bg-danger/5',
            )}
          >
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                day.inMonth ? 'text-text-primary' : 'text-text-muted',
              )}
            >
              {day.dayOfMonth}
            </span>
            {day.inMonth && day.status !== 'upcoming' && (
              <span className="mt-auto flex items-center gap-1">
                <span className={cn('size-1.5 rounded-full', STATUS_DOT[day.status])} />
                {day.record?.workedHours != null && (
                  <span className="text-[10px] tabular-nums text-text-muted">
                    {day.record.workedHours}h
                  </span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-border">
        {(['present', 'absent', 'holiday', 'weekend'] as DayStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className={cn('size-2 rounded-full', STATUS_DOT[s])} />
            {t(`calendar.legend.${s}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
