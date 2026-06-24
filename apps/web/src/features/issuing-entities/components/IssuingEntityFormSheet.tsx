import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { IssuingEntityDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { IssuingEntityLogoUploader } from './IssuingEntityLogoUploader';

const schema = z.object({
  name: z.string().trim().min(1, 'issuingEntities.validation.nameRequired').max(200),
  address: z.string().max(500).optional(),
  taxCode: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
});

export type IssuingEntityFormData = z.infer<typeof schema>;

interface IssuingEntityFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: IssuingEntityDto | null;
  onSubmit: (data: IssuingEntityFormData) => void;
  isLoading?: boolean;
}

export function IssuingEntityFormSheet({
  open,
  onOpenChange,
  entity,
  onSubmit,
  isLoading,
}: IssuingEntityFormSheetProps) {
  const { t } = useTranslation('settings');
  const isEditing = !!entity;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IssuingEntityFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', taxCode: '', phone: '', isDefault: false },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: entity?.name ?? '',
      address: entity?.address ?? '',
      taxCode: entity?.taxCode ?? '',
      phone: entity?.phone ?? '',
      isDefault: entity?.isDefault ?? false,
    });
  }, [open, entity, reset]);

  const isDefault = watch('isDefault');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? t('issuingEntities.form.editTitle') : t('issuingEntities.form.createTitle')}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? t('issuingEntities.form.editDescription')
              : t('issuingEntities.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="issuing-entity-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ie-name">
              {t('issuingEntities.fields.name')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="ie-name"
              className="h-9 text-sm"
              placeholder={t('issuingEntities.fields.namePlaceholder')}
              error={!!errors.name}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-danger">{t(errors.name.message as string)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ie-address">{t('issuingEntities.fields.address')}</Label>
            <Input id="ie-address" className="h-9 text-sm" {...register('address')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ie-taxCode">{t('issuingEntities.fields.taxCode')}</Label>
              <Input
                id="ie-taxCode"
                className="h-9 text-sm tabular-nums"
                {...register('taxCode')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ie-phone">{t('issuingEntities.fields.phone')}</Label>
              <Input id="ie-phone" className="h-9 text-sm tabular-nums" {...register('phone')} />
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
              checked={!!isDefault}
              onChange={(e) => setValue('isDefault', e.target.checked, { shouldDirty: true })}
            />
            <span>
              <span className="text-sm font-medium text-text-primary block">
                {t('issuingEntities.fields.isDefault')}
              </span>
              <span className="text-xs text-text-muted block mt-0.5">
                {t('issuingEntities.fields.isDefaultHint')}
              </span>
            </span>
          </label>

          {/* Logo: only after the entity exists (needs an id to upload against). */}
          {isEditing && entity ? (
            <div className="border-t border-border pt-4">
              <IssuingEntityLogoUploader entity={entity} />
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-xs text-text-muted">
              {t('issuingEntities.logo.createHint')}
            </p>
          )}
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('issuingEntities.form.cancel')}
          </Button>
          <Button type="submit" form="issuing-entity-form" disabled={isLoading}>
            {isLoading
              ? t('saving')
              : isEditing
                ? t('issuingEntities.form.save')
                : t('issuingEntities.form.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
