import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, Loader2, Clock, Check } from 'lucide-react';
import type { AttendanceRecordDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/api-error';
import { useCheckIn, useCheckOut } from '../hooks/useAttendance';
import { formatTime } from '../utils';

interface CheckInCardProps {
  today?: AttendanceRecordDto;
}

export function CheckInCard({ today }: CheckInCardProps) {
  const { t, i18n } = useTranslation('timesheet');
  const [note, setNote] = useState('');
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const hasCheckedIn = !!today?.checkInAt;
  const hasCheckedOut = !!today?.checkOutAt;
  const isBusy = checkIn.isPending || checkOut.isPending;

  function handleError(err: unknown) {
    toast.error(t('checkIn.toast.error'), { description: getApiErrorMessage(err, t('toast.tryAgain')) });
  }

  function doCheckIn() {
    checkIn.mutate(
      { note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('checkIn.toast.checkedIn'));
          setNote('');
        },
        onError: handleError,
      },
    );
  }

  function doCheckOut() {
    checkOut.mutate(
      { note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('checkIn.toast.checkedOut'));
          setNote('');
        },
        onError: handleError,
      },
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Clock className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('checkIn.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('checkIn.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {t('checkIn.checkInAt')}
          </p>
          <p className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
            {formatTime(today?.checkInAt ?? null, i18n.language)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {t('checkIn.checkOutAt')}
          </p>
          <p className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
            {formatTime(today?.checkOutAt ?? null, i18n.language)}
          </p>
        </div>
      </div>

      {!hasCheckedOut && (
        <div className="space-y-1.5 mb-4">
          <Label htmlFor="attendance-note" className="text-sm font-medium">
            {t('checkIn.note')}
          </Label>
          <Input
            id="attendance-note"
            type="text"
            maxLength={500}
            placeholder={t('checkIn.notePlaceholder')}
            className="h-9 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {hasCheckedOut ? (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 py-2.5 text-sm font-medium text-green-700 dark:text-green-300">
          <Check className="size-4" />
          {t('checkIn.done')}
          {today?.workedHours != null && (
            <span className="tabular-nums">· {t('checkIn.workedHours', { hours: today.workedHours })}</span>
          )}
        </div>
      ) : hasCheckedIn ? (
        <Button
          type="button"
          size="lg"
          className="w-full gap-2"
          disabled={isBusy}
          onClick={doCheckOut}
        >
          {checkOut.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          {t('checkIn.checkOut')}
        </Button>
      ) : (
        <Button
          type="button"
          size="lg"
          className="w-full gap-2"
          disabled={isBusy}
          onClick={doCheckIn}
        >
          {checkIn.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {t('checkIn.checkIn')}
        </Button>
      )}
    </div>
  );
}
