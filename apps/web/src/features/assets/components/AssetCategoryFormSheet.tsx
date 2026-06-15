import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { AssetCategoryDto } from '@hrm/shared';
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

const categoryFormSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired').max(100, 'validation.nameMax'),
  code: z
    .string()
    .min(1, 'validation.codeRequired')
    .max(40, 'validation.codeMax')
    .regex(/^[A-Z0-9_-]+$/, 'validation.codeFormat'),
  description: z.string().max(500, 'validation.descriptionMax').optional(),
});

export type AssetCategoryFormData = z.infer<typeof categoryFormSchema>;

interface AssetCategoryFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: AssetCategoryDto | null;
  onSubmit: (data: AssetCategoryFormData) => void;
  isLoading?: boolean;
}

export function AssetCategoryFormSheet({
  open,
  onOpenChange,
  category,
  onSubmit,
  isLoading,
}: AssetCategoryFormSheetProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const isEditing = !!category;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssetCategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', code: '', description: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? '',
        code: category?.code ?? '',
        description: category?.description ?? '',
      });
    }
  }, [open, category, reset]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? t('category.form.edit') : t('category.form.create')}
          </SheetTitle>
          <SheetDescription>
            {isEditing ? t('category.form.editDescription') : t('category.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="asset-category-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">
              {t('category.form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="name"
              placeholder={t('category.form.namePlaceholder')}
              error={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-danger">{t(errors.name.message!)}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">
              {t('category.form.codeLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="code"
              placeholder={t('category.form.codePlaceholder')}
              error={!!errors.code}
              disabled={isEditing}
              {...register('code')}
            />
            {/* code is immutable after creation — it keys the assets that reference it. */}
            {isEditing ? (
              <p className="text-xs text-text-muted">{t('category.form.codeImmutable')}</p>
            ) : (
              errors.code && <p className="text-xs text-danger">{t(errors.code.message!)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{t('category.form.descriptionLabel')}</Label>
            <Textarea
              id="description"
              placeholder={t('category.form.descriptionPlaceholder')}
              error={!!errors.description}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-danger">{t(errors.description.message!)}</p>
            )}
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="asset-category-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('category.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
