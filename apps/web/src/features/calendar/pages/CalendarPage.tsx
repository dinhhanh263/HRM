import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEventNavigation } from '@/features/dashboard/useEventNavigation';
import { usePublicSettings } from '@/features/settings/hooks/useSettings';
import { EventCalendar } from '../components/EventCalendar';
import { useCalendarEvents } from '../hooks/useCalendarEvents';

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, offset: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return monthKeyOf(new Date(year, monthIndex + offset, 1));
}

function CalendarSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4" aria-busy="true">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-24 rounded bg-surface-alt animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// SPEC-035 — month view of HR events (scoped server-side) + tenant holidays.
export function CalendarPage() {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const { data, isLoading, isError } = useCalendarEvents(month);
  const { data: publicSettings } = usePublicSettings();
  const getEventAction = useEventNavigation();
  const weekStart = publicSettings?.regional.weekStart ?? 'mon';

  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('calendar.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('calendar.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label={t('calendar.prevMonth')}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold text-text-primary min-w-36 text-center capitalize tabular-nums">
            {monthTitle}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label={t('calendar.nextMonth')}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => setMonth(monthKeyOf(new Date()))}
          >
            {t('calendar.today')}
          </Button>
        </div>
      </div>

      {isError ? (
        <div
          role="alert"
          className="bg-danger-light border border-danger/30 text-danger rounded-xl px-5 py-4 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('calendar.errorLoad')}
        </div>
      ) : isLoading || !data ? (
        <CalendarSkeleton />
      ) : (
        <>
          <EventCalendar
            month={month}
            events={data.events}
            holidays={data.holidays}
            weekStart={weekStart}
            getEventAction={getEventAction}
          />
          {data.events.length === 0 && (
            <p className="text-sm text-text-muted text-center m-0">{t('calendar.empty')}</p>
          )}
        </>
      )}
    </div>
  );
}
