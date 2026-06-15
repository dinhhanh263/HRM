import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { useSubmitOvertime, useResubmitOvertime } from '../hooks/useOvertime';
import { currentDateKey } from '../utils';
import type { OvertimeRequestDto } from '@hrm/shared';

interface OvertimeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed the work-date when opening (e.g. the holiday just checked-in on). Defaults to today. */
  initialDate?: string;
  /** When set, the sheet edits + resubmits this RETURNED request instead of creating a new one. */
  resubmitTarget?: OvertimeRequestDto;
}

const MAX_OT_HOURS = 12;

export function OvertimeSheet({ open, onOpenChange, initialDate, resubmitTarget }: OvertimeSheetProps) {
  const { t } = useTranslation('timesheet');
  const submit = useSubmitOvertime();
  const resubmit = useResubmitOvertime();
  const isResubmit = !!resubmitTarget;
  const mutation = isResubmit ? resubmit : submit;
  const [workDate, setWorkDate] = useState(currentDateKey);
  const [hours, setHours] = useState('');
  const [night, setNight] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      if (resubmitTarget) {
        setWorkDate(resubmitTarget.workDate.slice(0, 10));
        setHours(String(resubmitTarget.hours));
        setNight(resubmitTarget.night);
        setReason(resubmitTarget.reason ?? '');
      } else {
        setWorkDate(initialDate ?? currentDateKey());
        setHours('');
        setNight(false);
        setReason('');
      }
    }
  }, [open, initialDate, resubmitTarget]);

  const hoursNum = Number(hours);
  const hoursValid = hours !== '' && Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= MAX_OT_HOURS;
  const dateValid = workDate !== '' && workDate <= currentDateKey();
  const canSubmit = hoursValid && dateValid && !mutation.isPending;

  function doSubmit() {
    if (!canSubmit) return;
    const payload = {
      workDate,
      hours: hoursNum,
      night,
      reason: reason.trim() || undefined,
    };
    const onSuccess = () => {
      toast.success(t(isResubmit ? 'overtime.toast.resubmitted' : 'overtime.toast.submitted'));
      onOpenChange(false);
    };
    const onError = (err: unknown) => {
      toast.error(t('overtime.toast.submitError'), {
        description: getApiErrorMessage(err, t('toast.tryAgain')),
      });
    };

    if (resubmitTarget) {
      resubmit.mutate({ id: resubmitTarget.id, data: payload }, { onSuccess, onError });
    } else {
      submit.mutate(payload, { onSuccess, onError });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[460px]">
        <SheetHeader>
          <SheetTitle>{t(isResubmit ? 'overtime.form.resubmitTitle' : 'overtime.form.title')}</SheetTitle>
          <SheetDescription>{t(isResubmit ? 'overtime.form.resubmitDesc' : 'overtime.form.desc')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ot-date" className="text-sm font-medium">
              {t('overtime.form.workDate')}
            </Label>
            <Input
              id="ot-date"
              type="date"
              max={currentDateKey()}
              className="h-9 text-sm tabular-nums"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ot-hours" className="text-sm font-medium">
              {t('overtime.form.hours')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="ot-hours"
              type="number"
              min={0.5}
              max={MAX_OT_HOURS}
              step={0.5}
              placeholder="0"
              className="h-9 text-sm tabular-nums"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <p className="text-xs text-text-muted">{t('overtime.form.hoursHint', { max: MAX_OT_HOURS })}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('overtime.form.night')}</Label>
            <button
              type="button"
              onClick={() => setNight((v) => !v)}
              aria-pressed={night}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                night
                  ? 'border-primary/40 bg-primary/5 text-text-primary'
                  : 'border-border bg-surface text-text-secondary hover:text-text-primary',
              )}
            >
              <span className="flex items-center gap-2">
                <Moon className={cn('size-4', night ? 'text-primary' : 'text-text-muted')} />
                {t('overtime.form.nightLabel')}
              </span>
              <span
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  night ? 'bg-primary' : 'bg-border-strong',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
                    night ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </span>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ot-reason" className="text-sm font-medium">
              {t('overtime.form.reason')}
            </Label>
            <Textarea
              id="ot-reason"
              maxLength={500}
              placeholder={t('overtime.form.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <p className="text-xs text-text-muted">{t('overtime.form.categoryHint')}</p>
        </div>

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              {t('actions.cancel', { ns: 'common' })}
            </Button>
          </SheetClose>
          <Button type="button" onClick={doSubmit} disabled={!canSubmit} className="gap-1.5">
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {t(isResubmit ? 'overtime.form.resubmit' : 'overtime.form.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
