import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { Loader2, Save } from 'lucide-react';
import { useTimesheetPolicy, useUpdateTimesheetPolicy } from '../hooks/useTimesheetPolicy';

// 0=Sun .. 6=Sat (JS getDay). Reordered Mon-first for display.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const schema = z.object({
  workdays: z.array(z.number()).min(1),
  standardHoursPerDay: z.coerce.number().positive().max(24),
  nightStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  nightEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  otWeekday: z.coerce.number().min(1).max(10),
  otWeekend: z.coerce.number().min(1).max(10),
  otHoliday: z.coerce.number().min(1).max(10),
  nightExtra: z.coerce.number().min(0).max(10),
  nightOtExtra: z.coerce.number().min(0).max(10),
});

type FormData = z.infer<typeof schema>;

export function PolicySettings() {
  const { t } = useTranslation('timesheet');
  const { can } = usePermission();
  const canConfigure = can('timesheet:configure');
  const { data: policy, isLoading } = useTimesheetPolicy();
  const updateMutation = useUpdateTimesheetPolicy();

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (policy) {
      reset({
        workdays: policy.workdays,
        standardHoursPerDay: policy.standardHoursPerDay,
        nightStart: policy.nightStart,
        nightEnd: policy.nightEnd,
        otWeekday: policy.otWeekday,
        otWeekend: policy.otWeekend,
        otHoliday: policy.otHoliday,
        nightExtra: policy.nightExtra,
        nightOtExtra: policy.nightOtExtra,
      });
    }
  }, [policy, reset]);

  const workdays = watch('workdays') ?? [];

  function toggleDay(day: number) {
    if (!canConfigure) return;
    const next = workdays.includes(day)
      ? workdays.filter((d) => d !== day)
      : [...workdays, day];
    setValue('workdays', next, { shouldDirty: true });
  }

  function submit(data: FormData) {
    updateMutation.mutate(data, {
      onSuccess: () => toast.success(t('policy.toast.saved')),
      onError: () => toast.error(t('policy.toast.saveError'), { description: t('toast.tryAgain') }),
    });
  }

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 space-y-4 shadow-sm">
        <Skeleton className="h-4 w-1/3 rounded" />
        <Skeleton className="h-9 w-full rounded" />
        <Skeleton className="h-9 w-2/3 rounded" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('policy.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('policy.subtitle')}</p>
        </div>
        {canConfigure && (
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {t('actions.save', { ns: 'common' })}
          </Button>
        )}
      </div>

      <div className="p-5 space-y-6">
        {/* Workdays */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('policy.workdays')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((day) => {
              const active = workdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  disabled={!canConfigure}
                  aria-pressed={active}
                  className={cn(
                    'h-9 min-w-[3rem] px-3 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary border border-primary/40'
                      : 'bg-surface-alt text-text-muted border border-border hover:text-text-primary',
                    !canConfigure && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {t(`policy.dayShort.${day}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Standard hours + night window */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ts-hours" className="text-sm font-medium">
              {t('policy.standardHoursPerDay')}
            </Label>
            <Input
              id="ts-hours"
              type="number"
              step="0.5"
              min={0}
              max={24}
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              {...register('standardHoursPerDay')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-night-start" className="text-sm font-medium">
              {t('policy.nightStart')}
            </Label>
            <Input
              id="ts-night-start"
              type="time"
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              {...register('nightStart')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-night-end" className="text-sm font-medium">
              {t('policy.nightEnd')}
            </Label>
            <Input
              id="ts-night-end"
              type="time"
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              {...register('nightEnd')}
            />
          </div>
        </div>

        {/* OT multipliers */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('policy.multipliers')}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {(
              [
                ['otWeekday', 1],
                ['otWeekend', 1],
                ['otHoliday', 1],
                ['nightExtra', 0],
                ['nightOtExtra', 0],
              ] as const
            ).map(([field, min]) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`ts-${field}`} className="text-xs font-medium text-text-secondary">
                  {t(`policy.fields.${field}`)}
                </Label>
                <Input
                  id={`ts-${field}`}
                  type="number"
                  step="0.1"
                  min={min}
                  max={10}
                  className="h-9 text-sm tabular-nums"
                  disabled={!canConfigure}
                  {...register(field)}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">{t('policy.multipliersHint')}</p>
        </div>
      </div>
    </form>
  );
}
