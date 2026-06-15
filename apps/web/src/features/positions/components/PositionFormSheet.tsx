import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { PositionDto, DepartmentDto } from '@hrm/shared';
import { PositionLevel } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { LEVEL_OPTIONS } from '../lib/level';

export const NO_DEPARTMENT = 'none';

const positionFormSchema = z.object({
  name: z.string().min(1).max(100),
  departmentId: z.string(),
  level: z.string(),
});

export type PositionFormData = z.infer<typeof positionFormSchema>;

interface PositionFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position?: PositionDto | null;
  departments: DepartmentDto[];
  onSubmit: (data: PositionFormData) => void;
  isLoading?: boolean;
}

export function PositionFormSheet({
  open,
  onOpenChange,
  position,
  departments,
  onSubmit,
  isLoading,
}: PositionFormSheetProps) {
  const { t } = useTranslation('position');
  const { t: tc } = useTranslation('common');
  const isEditing = !!position;

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t('validation.nameRequired'))
          .max(100, t('validation.nameMax')),
        departmentId: z.string(),
        level: z.string(),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<PositionFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', departmentId: NO_DEPARTMENT, level: String(PositionLevel.JUNIOR) },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: position?.name ?? '',
        departmentId: position?.departmentId ?? NO_DEPARTMENT,
        level: String(position?.level ?? PositionLevel.JUNIOR),
      });
    }
  }, [open, position, reset]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('form.editTitle') : t('form.createTitle')}</SheetTitle>
          <SheetDescription>
            {isEditing ? t('form.editDescription') : t('form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form id="position-form" onSubmit={handleSubmit(onSubmit)} className="mt-6 flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              {t('form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="name"
              placeholder={t('form.namePlaceholder')}
              error={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="departmentId">{t('form.departmentLabel')}</Label>
            <Controller
              name="departmentId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="departmentId">
                    <SelectValue placeholder={t('form.departmentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>{t('form.noDepartmentOption')}</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="level">{t('form.levelLabel')}</Label>
            <Controller
              name="level"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="level">
                    <SelectValue placeholder={t('form.levelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {t(o.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="position-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
