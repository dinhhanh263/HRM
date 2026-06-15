import { useTranslation } from 'react-i18next';
import type { DashboardEvent, HolidayDto, TenantWeekStart } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { EVENT_STYLE } from '@/features/dashboard/event-style';

const MAX_CHIPS_PER_DAY = 3;

interface EventCalendarProps {
  month: string; // YYYY-MM
  events: DashboardEvent[];
  holidays: HolidayDto[];
  /** SPEC-036 tenant regional default; mon = Monday-first (default). */
  weekStart?: TenantWeekStart;
  /** SPEC-034 deep-link resolver; undefined → chip renders non-interactive. */
  getEventAction: (event: DashboardEvent) => (() => void) | undefined;
}

interface DayCell {
  iso: string; // YYYY-MM-DD
  dayNumber: number;
}

// Grid of the month starting on the configured weekday, padded with nulls for
// the leading/trailing days that belong to adjacent months.
function buildMonthGrid(month: string, weekStart: TenantWeekStart): (DayCell | null)[] {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const firstWeekday = weekStart === 'sun' ? 0 : 1;
  const leading = (new Date(year, monthIndex, 1).getDay() - firstWeekday + 7) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (DayCell | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: `${month}-${String(day).padStart(2, '0')}`, dayNumber: day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function localTodayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function EventChip({
  event,
  onClick,
}: {
  event: DashboardEvent;
  onClick?: () => void;
}) {
  const { t } = useTranslation('dashboard');
  const style = EVENT_STYLE[event.kind];
  const Icon = style.icon;
  const label = t(`events.${style.titleKey}`, { name: event.employeeName, years: event.years });
  const chipClass = cn(
    'w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-left',
    style.wrap,
  );

  if (!onClick) {
    return (
      <div className={chipClass}>
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        chipClass,
        'cursor-pointer transition-colors duration-100 hover:opacity-80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function EventCalendar({
  month,
  events,
  holidays,
  weekStart = 'mon',
  getEventAction,
}: EventCalendarProps) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const cells = buildMonthGrid(month, weekStart);
  const todayIso = localTodayIso();

  // 2024-01-01 là thứ Hai (2023-12-31 là Chủ nhật) — mốc sinh nhãn thứ theo locale.
  const weekdayBase = weekStart === 'sun' ? new Date(2023, 11, 31) : new Date(2024, 0, 1);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
      new Date(weekdayBase.getFullYear(), weekdayBase.getMonth(), weekdayBase.getDate() + i),
    ),
  );

  const eventsByDay = new Map<string, DashboardEvent[]>();
  for (const event of events) {
    const list = eventsByDay.get(event.date) ?? [];
    list.push(event);
    eventsByDay.set(event.date, list);
  }
  const holidayByDay = new Map(holidays.map((h) => [h.date, h]));

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-background">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            data-testid="calendar-weekday"
            className="px-2 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide text-center"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`pad-${i}`} className="bg-surface-alt/50 min-h-24" aria-hidden="true" />;
          }
          const dayEvents = eventsByDay.get(cell.iso) ?? [];
          const holiday = holidayByDay.get(cell.iso);
          const overflow = dayEvents.length - MAX_CHIPS_PER_DAY;
          const isToday = cell.iso === todayIso;
          return (
            <div
              key={cell.iso}
              data-testid={`calendar-day-${cell.iso}`}
              className={cn('bg-surface min-h-24 p-1.5 flex flex-col gap-1', holiday && 'bg-primary/5')}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'text-xs tabular-nums size-5 flex items-center justify-center rounded-full',
                    isToday ? 'bg-primary text-primary-foreground font-semibold' : 'text-text-secondary',
                  )}
                >
                  {cell.dayNumber}
                </span>
                {holiday && (
                  <span className="text-[10px] text-primary font-medium truncate" title={holiday.name}>
                    {holiday.name}
                  </span>
                )}
              </div>
              {dayEvents.slice(0, MAX_CHIPS_PER_DAY).map((event, j) => (
                <EventChip
                  key={`${event.kind}-${event.employeeId}-${j}`}
                  event={event}
                  onClick={getEventAction(event)}
                />
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-text-muted px-1.5">
                  {t('calendar.more', { count: overflow })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
