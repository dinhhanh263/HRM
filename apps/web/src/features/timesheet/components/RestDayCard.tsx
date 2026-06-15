import { useTranslation } from 'react-i18next';
import { Sparkles, CalendarOff, CalendarClock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RestDayKind } from '../utils';

interface RestDayCardProps {
  /** Why today is a paid day off — drives the icon, copy and OT rate hint. */
  kind: RestDayKind;
  /** Holiday display name (e.g. "Quốc khánh"); present only when kind === 'holiday'. */
  holidayName?: string;
  /** Whether an overtime request already exists for today (any status). */
  hasOvertime: boolean;
  /** Open the overtime form pre-filled with today's date. */
  onCreateOt: () => void;
}

/**
 * Replaces the check-in card on a paid rest day (public holiday or weekly rest).
 * Attendance isn't recorded on these days (Điều 112 BLLĐ); any work is paid only
 * through an approved overtime request — holiday ≥300%, weekend ≥200% (Điều 98).
 * So instead of clocking in, the employee gets a guideline and a CTA to file OT.
 */
export function RestDayCard({ kind, holidayName, hasOvertime, onCreateOt }: RestDayCardProps) {
  const { t } = useTranslation('timesheet');
  const Icon = kind === 'holiday' ? Sparkles : CalendarOff;
  const title =
    kind === 'holiday'
      ? t('overtime.restDay.holiday.title', { name: holidayName })
      : t('overtime.restDay.weekend.title');
  const desc =
    kind === 'holiday' ? t('overtime.restDay.holiday.desc') : t('overtime.restDay.weekend.desc');

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface rounded-xl border border-border p-5 shadow-sm
        animate-in fade-in-0 slide-in-from-top-1 duration-150"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('overtime.restDay.subtitle')}</p>
        </div>
      </div>

      <p className="text-sm text-text-secondary">{desc}</p>

      {hasOvertime ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 py-2.5 text-sm font-medium text-green-700 dark:text-green-300">
          <Check className="size-4" />
          {t('overtime.restDay.hasOt')}
        </div>
      ) : (
        <Button type="button" size="lg" className="mt-4 w-full gap-2" onClick={onCreateOt}>
          <CalendarClock className="size-4" />
          {t('overtime.restDay.cta')}
        </Button>
      )}
    </div>
  );
}
