import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CreateMaintenanceInput, CompleteMaintenanceInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function buildSchema(isStart: boolean) {
  return z.object({
    date: z.string().min(1, 'asset.maintenance.validation.dateRequired'),
    description: isStart
      ? z
          .string()
          .min(1, 'asset.maintenance.validation.descriptionRequired')
          .max(1000, 'asset.maintenance.validation.descriptionMax')
      : z.string().max(1000, 'asset.maintenance.validation.descriptionMax').optional().or(z.literal('')),
    vendor: z.string().max(120, 'asset.maintenance.validation.vendorMax').optional().or(z.literal('')),
    cost: z.string().optional().or(z.literal('')),
  });
}

type MaintenanceFormData = z.infer<ReturnType<typeof buildSchema>>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface MaintenanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'start' | 'complete';
  onStart?: (data: CreateMaintenanceInput) => void;
  onComplete?: (data: CompleteMaintenanceInput) => void;
  isLoading?: boolean;
}

export function MaintenanceSheet({
  open,
  onOpenChange,
  mode,
  onStart,
  onComplete,
  isLoading,
}: MaintenanceSheetProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const isStart = mode === 'start';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceFormData>({
    resolver: zodResolver(buildSchema(isStart)),
    defaultValues: { date: today(), description: '', vendor: '', cost: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ date: today(), description: '', vendor: '', cost: '' });
    }
  }, [open, reset]);

  function submit(data: MaintenanceFormData) {
    const cost = data.cost && data.cost.trim() ? Number(data.cost) : null;
    const vendor = data.vendor && data.vendor.trim() ? data.vendor.trim() : null;
    const description = data.description && data.description.trim() ? data.description.trim() : '';

    if (isStart) {
      onStart?.({ startedAt: data.date, description, vendor, cost });
    } else {
      onComplete?.({
        completedAt: data.date,
        description: description || undefined,
        vendor,
        cost,
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isStart ? t('asset.maintenance.startTitle') : t('asset.maintenance.completeTitle')}
          </SheetTitle>
          <SheetDescription>
            {isStart
              ? t('asset.maintenance.startDescription')
              : t('asset.maintenance.completeDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="maintenance-form"
          onSubmit={handleSubmit(submit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="date">
              {isStart
                ? t('asset.maintenance.startedAtLabel')
                : t('asset.maintenance.completedAtLabel')}{' '}
              <span className="text-danger">*</span>
            </Label>
            <Input id="date" type="date" error={!!errors.date} {...register('date')} />
            {errors.date && <p className="text-xs text-danger">{t(errors.date.message!)}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">
              {t('asset.maintenance.descriptionLabel')}
              {isStart && <span className="text-danger"> *</span>}
            </Label>
            <Textarea
              id="description"
              placeholder={t('asset.maintenance.descriptionPlaceholder')}
              error={!!errors.description}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-danger">{t(errors.description.message!)}</p>
            )}
          </div>

          {/* Vendor */}
          <div className="space-y-1.5">
            <Label htmlFor="vendor">{t('asset.maintenance.vendorLabel')}</Label>
            <Input
              id="vendor"
              placeholder={t('asset.maintenance.vendorPlaceholder')}
              error={!!errors.vendor}
              {...register('vendor')}
            />
            {errors.vendor && <p className="text-xs text-danger">{t(errors.vendor.message!)}</p>}
          </div>

          {/* Cost */}
          <div className="space-y-1.5">
            <Label htmlFor="cost">{t('asset.maintenance.costLabel')}</Label>
            <Input
              id="cost"
              type="number"
              min="0"
              step="1000"
              placeholder="0"
              className="tabular-nums"
              {...register('cost')}
            />
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="maintenance-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isStart
                ? t('asset.maintenance.startSubmit')
                : t('asset.maintenance.completeSubmit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
