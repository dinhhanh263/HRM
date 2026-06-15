import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { AssetCondition, ReturnAssetInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

const returnFormSchema = z.object({
  returnedAt: z.string().min(1, 'asset.return.validation.dateRequired'),
  conditionIn: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']).optional().or(z.literal('')),
  note: z.string().max(1000, 'asset.return.validation.noteMax').optional().or(z.literal('')),
});

type ReturnFormData = z.infer<typeof returnFormSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ReturnAssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holderName?: string | null;
  onSubmit: (data: ReturnAssetInput) => void;
  isLoading?: boolean;
}

export function ReturnAssetSheet({
  open,
  onOpenChange,
  holderName,
  onSubmit,
  isLoading,
}: ReturnAssetSheetProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ReturnFormData>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: { returnedAt: today(), conditionIn: '', note: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ returnedAt: today(), conditionIn: '', note: '' });
    }
  }, [open, reset]);

  function submit(data: ReturnFormData) {
    onSubmit({
      returnedAt: data.returnedAt,
      conditionIn: data.conditionIn ? data.conditionIn : null,
      note: data.note && data.note.trim() ? data.note.trim() : null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('asset.return.title')}</SheetTitle>
          <SheetDescription>
            {holderName
              ? t('asset.return.descriptionHolder', { name: holderName })
              : t('asset.return.description')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="return-form"
          onSubmit={handleSubmit(submit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {/* Returned date */}
          <div className="space-y-1.5">
            <Label htmlFor="returnedAt">
              {t('asset.return.dateLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="returnedAt"
              type="date"
              error={!!errors.returnedAt}
              {...register('returnedAt')}
            />
            {errors.returnedAt && (
              <p className="text-xs text-danger">{t(errors.returnedAt.message!)}</p>
            )}
          </div>

          {/* Condition in */}
          <div className="space-y-1.5">
            <Label htmlFor="conditionIn">{t('asset.return.conditionLabel')}</Label>
            <Controller
              name="conditionIn"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="conditionIn">
                    <SelectValue placeholder={t('asset.form.conditionPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`condition.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">{t('asset.return.noteLabel')}</Label>
            <Textarea
              id="note"
              placeholder={t('asset.return.notePlaceholder')}
              error={!!errors.note}
              {...register('note')}
            />
            {errors.note && <p className="text-xs text-danger">{t(errors.note.message!)}</p>}
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="return-form" disabled={isLoading}>
            {isLoading ? tc('states.saving') : t('asset.return.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
