import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Loader2, CalendarDays, Sparkles } from 'lucide-react';
import type { HolidayDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { usePermission } from '@/hooks/usePermission';
import {
  useHolidays,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useSeedHolidays,
} from '../hooks/useHolidays';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(120),
  recurring: z.boolean(),
});

type FormData = z.infer<typeof schema>;

function formatHolidayDate(iso: string, lng: string): string {
  // iso is YYYY-MM-DD; render at UTC to avoid timezone shifting the calendar day.
  const d = new Date(`${iso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function HolidaySettings() {
  const { t, i18n } = useTranslation('timesheet');
  const { can } = usePermission();
  const canConfigure = can('timesheet:configure');

  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayDto | null>(null);
  const [deleting, setDeleting] = useState<HolidayDto | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);

  const { data: holidays, isLoading } = useHolidays(year);
  const createMutation = useCreateHoliday();
  const updateMutation = useUpdateHoliday();
  const deleteMutation = useDeleteHoliday();
  const seedMutation = useSeedHolidays();

  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: '', name: '', recurring: false },
  });
  const recurring = watch('recurring');

  function openCreate() {
    setEditing(null);
    reset({ date: `${year}-01-01`, name: '', recurring: false });
    setSheetOpen(true);
  }

  function openEdit(h: HolidayDto) {
    setEditing(h);
    reset({ date: h.date, name: h.name, recurring: h.recurring });
    setSheetOpen(true);
  }

  function handleSaveError(err: unknown) {
    if (isAxiosError(err) && err.response?.status === 409) {
      toast.error(t('holiday.toast.conflict'));
      return;
    }
    toast.error(t('holiday.toast.saveError'), { description: t('toast.tryAgain') });
  }

  function submit(data: FormData) {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data },
        {
          onSuccess: () => {
            toast.success(t('holiday.toast.updated'));
            setSheetOpen(false);
          },
          onError: handleSaveError,
        },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast.success(t('holiday.toast.created'));
          setSheetOpen(false);
        },
        onError: handleSaveError,
      });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(t('holiday.toast.deleted'));
        setDeleting(null);
      },
      onError: () => toast.error(t('holiday.toast.deleteError'), { description: t('toast.tryAgain') }),
    });
  }

  function confirmSeed() {
    seedMutation.mutate(
      { year },
      {
        onSuccess: (result) => {
          if (result.lunarCovered) {
            toast.success(
              t('holiday.seed.toast.success', { count: result.seeded, year: result.year }),
            );
          } else {
            // Only solar holidays were seeded — Tết/Giỗ Tổ data is missing for this year.
            toast.warning(t('holiday.seed.toast.noLunar', { year: result.year }), {
              description: t('holiday.seed.toast.noLunarDesc', { count: result.seeded }),
            });
          }
          setSeedOpen(false);
        },
        onError: () =>
          toast.error(t('holiday.seed.toast.error'), { description: t('toast.tryAgain') }),
      },
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-background">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('holiday.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('holiday.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label={t('holiday.prevYear')}
              className="h-8 w-8 flex items-center justify-center rounded-l-md text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-sm font-medium tabular-nums text-text-primary">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label={t('holiday.nextYear')}
              className="h-8 w-8 flex items-center justify-center rounded-r-md text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {canConfigure && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setSeedOpen(true)}
              >
                <Sparkles className="size-3.5" />
                {t('holiday.seed.button', { year })}
              </Button>
              <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
                <Plus className="size-3.5" />
                {t('holiday.add')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !holidays || holidays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
              <CalendarDays className="size-5 text-text-muted" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">{t('holiday.empty.title')}</h3>
            <p className="text-xs text-text-muted max-w-xs mb-3">{t('holiday.empty.desc')}</p>
            {canConfigure && (
              <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
                <Plus className="size-3.5" />
                {t('holiday.add')}
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {holidays.map((h) => (
              <li key={h.id} className="group flex items-center gap-3 px-2 py-2.5">
                <div className="w-36 shrink-0 text-sm tabular-nums text-text-secondary">
                  {formatHolidayDate(h.date, i18n.language)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{h.name}</p>
                </div>
                {h.recurring && (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium bg-primary/5 text-primary border-primary/30"
                  >
                    {t('holiday.recurring')}
                  </Badge>
                )}
                {canConfigure && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openEdit(h)}
                      aria-label={t('holiday.editAction')}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-alt transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(h)}
                      aria-label={t('holiday.deleteAction')}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[420px] sm:w-[460px]">
          <form onSubmit={handleSubmit(submit)} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>
                {editing ? t('holiday.form.editTitle') : t('holiday.form.addTitle')}
              </SheetTitle>
              <SheetDescription>{t('holiday.form.desc')}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4 flex-1">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-date" className="text-sm font-medium">
                  {t('holiday.form.date')}
                </Label>
                <Input
                  id="holiday-date"
                  type="date"
                  className="h-9 text-sm tabular-nums"
                  {...register('date')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holiday-name" className="text-sm font-medium">
                  {t('holiday.form.name')}
                </Label>
                <Input
                  id="holiday-name"
                  type="text"
                  maxLength={120}
                  placeholder={t('holiday.form.namePlaceholder')}
                  className="h-9 text-sm"
                  {...register('name')}
                />
              </div>
              <button
                type="button"
                onClick={() => setValue('recurring', !recurring, { shouldDirty: true })}
                aria-pressed={recurring}
                className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-surface-alt transition-colors"
              >
                <span
                  className={
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ' +
                    (recurring ? 'bg-primary border-primary' : 'border-border-strong bg-surface')
                  }
                >
                  {recurring && <span className="size-2 rounded-sm bg-primary-foreground" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-text-primary">
                    {t('holiday.form.recurring')}
                  </span>
                  <span className="block text-xs text-text-muted mt-0.5">
                    {t('holiday.form.recurringHint')}
                  </span>
                </span>
              </button>
            </div>

            <SheetFooter className="mt-6">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
              </SheetClose>
              <Button type="submit" disabled={isSaving} className="gap-1.5">
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                {t('actions.save', { ns: 'common' })}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('holiday.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('holiday.delete.desc', { name: deleting?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t('actions.delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={seedOpen} onOpenChange={(open) => !seedMutation.isPending && setSeedOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('holiday.seed.dialogTitle', { year })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('holiday.seed.dialogDesc', { year })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={seedMutation.isPending}>
              {t('actions.cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSeed} disabled={seedMutation.isPending} className="gap-1.5">
              {seedMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t('holiday.seed.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
