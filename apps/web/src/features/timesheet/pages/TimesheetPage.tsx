import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useTimesheetPolicy } from '../hooks/useTimesheetPolicy';
import { useHolidays } from '../hooks/useHolidays';
import { useMyAttendance, useTimesheetSummary } from '../hooks/useAttendance';
import { useMyOvertime } from '../hooks/useOvertime';
import { CheckInCard } from '../components/CheckInCard';
import { RestDayCard } from '../components/RestDayCard';
import { OvertimeSheet } from '../components/OvertimeSheet';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { AttendanceList } from '../components/AttendanceList';
import { TeamAttendance } from '../components/TeamAttendance';
import { MyOvertimePanel } from '../components/MyOvertimePanel';
import { TeamOvertime } from '../components/TeamOvertime';
import { SummaryCard } from '../components/SummaryCard';
import {
  currentMonthKey,
  currentDateKey,
  shiftMonth,
  formatMonthTitle,
  defaultTimesheetTab,
  policyWorkdays,
  restDayInfo,
} from '../utils';

type ViewMode = 'calendar' | 'list';
type Tab = 'mine' | 'team';

export function TimesheetPage() {
  const { t, i18n } = useTranslation('timesheet');
  const { can } = usePermission();
  const canReview = can('timesheet:update');
  const [month, setMonth] = useState(() => currentMonthKey());
  const [tab, setTab] = useState<Tab>(() => defaultTimesheetTab(canReview));
  const [view, setView] = useState<ViewMode>('calendar');
  const [otSheetOpen, setOtSheetOpen] = useState(false);

  const year = Number(month.slice(0, 4));
  const { data: policy } = useTimesheetPolicy();
  const { data: holidays } = useHolidays(year);
  const { data: records, isLoading } = useMyAttendance(month);
  const { data: summary, isLoading: summaryLoading } = useTimesheetSummary(month);
  const { data: myOvertime } = useMyOvertime({ month });

  const todayKey = currentMonthKey() === month ? currentDateKey() : null;
  const todayRecord = useMemo(
    () => (todayKey ? records?.find((r) => r.workDate === todayKey) : undefined),
    [records, todayKey],
  );

  // On a paid rest day (public holiday or weekly rest), attendance isn't recorded
  // — we swap the check-in card for a guideline pointing at the right overtime
  // request. `hasOvertimeToday` lets the card confirm an existing request instead
  // of re-prompting. Only meaningful while viewing the current month.
  const todayRest = todayKey ? restDayInfo(todayKey, holidays, policyWorkdays(policy)) : undefined;
  const hasOvertimeToday = !!todayKey && (myOvertime?.data ?? []).some((r) => r.workDate === todayKey);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-text-muted mt-1">{t('subtitle')}</p>
        </div>
        {canReview && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt p-0.5">
            {(['mine', 'team'] as const).map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                aria-pressed={tab === tb}
                className={cn(
                  'h-8 px-3 rounded text-sm font-medium transition-colors',
                  tab === tb
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {t(tb === 'mine' ? 'team.tabMine' : 'team.tab')}
              </button>
            ))}
          </div>
        )}
      </div>

      {canReview && tab === 'team' ? (
        <div className="space-y-3">
          <MonthNavigator
            onPrev={() => setMonth((mo) => shiftMonth(mo, -1))}
            onNext={() => setMonth((mo) => shiftMonth(mo, 1))}
            label={formatMonthTitle(month, i18n.language)}
            prevLabel={t('prevMonth')}
            nextLabel={t('nextMonth')}
          />
          <TeamAttendance month={month} />
          <TeamOvertime month={month} />
        </div>
      ) : (
      <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {todayRest ? (
            <RestDayCard
              kind={todayRest.kind}
              holidayName={todayRest.holiday?.name}
              hasOvertime={hasOvertimeToday}
              onCreateOt={() => setOtSheetOpen(true)}
            />
          ) : (
            <CheckInCard today={todayRecord} />
          )}
          <SummaryCard
            summary={summary}
            isLoading={summaryLoading}
            monthLabel={formatMonthTitle(month, i18n.language)}
          />
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <MonthNavigator
              onPrev={() => setMonth((mo) => shiftMonth(mo, -1))}
              onNext={() => setMonth((mo) => shiftMonth(mo, 1))}
              label={formatMonthTitle(month, i18n.language)}
              prevLabel={t('prevMonth')}
              nextLabel={t('nextMonth')}
            />
            <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt p-0.5">
              <button
                type="button"
                onClick={() => setView('calendar')}
                aria-label={t('view.calendar')}
                aria-pressed={view === 'calendar'}
                className={cn(
                  'h-7 px-2.5 flex items-center gap-1.5 rounded text-xs font-medium transition-colors',
                  view === 'calendar'
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                <LayoutGrid className="size-3.5" />
                {t('view.calendar')}
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label={t('view.list')}
                aria-pressed={view === 'list'}
                className={cn(
                  'h-7 px-2.5 flex items-center gap-1.5 rounded text-xs font-medium transition-colors',
                  view === 'list'
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                <List className="size-3.5" />
                {t('view.list')}
              </button>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : view === 'calendar' ? (
            <AttendanceCalendar
              month={month}
              records={records ?? []}
              policy={policy}
              holidays={holidays ?? []}
            />
          ) : (
            <AttendanceList records={records ?? []} />
          )}
        </div>
      </div>
      <MyOvertimePanel month={month} />
      <OvertimeSheet
        open={otSheetOpen}
        onOpenChange={setOtSheetOpen}
        initialDate={todayKey ?? undefined}
      />
      </div>
      )}
    </div>
  );
}

interface MonthNavigatorProps {
  onPrev: () => void;
  onNext: () => void;
  label: string;
  prevLabel: string;
  nextLabel: string;
}

function MonthNavigator({ onPrev, onNext, label, prevLabel, nextLabel }: MonthNavigatorProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt">
      <button
        type="button"
        onClick={onPrev}
        aria-label={prevLabel}
        className="h-8 w-8 flex items-center justify-center rounded-l-md text-text-muted hover:text-text-primary transition-colors"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-3 text-sm font-medium text-text-primary min-w-32 text-center">{label}</span>
      <button
        type="button"
        onClick={onNext}
        aria-label={nextLabel}
        className="h-8 w-8 flex items-center justify-center rounded-r-md text-text-muted hover:text-text-primary transition-colors"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
