import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { AssetDto, AssetCondition, CreateAssetInput } from '@hrm/shared';
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
import { useAssetCategories } from '../hooks/useAssetCategories';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

const optionalText = (max: number, key: string) =>
  z.string().max(max, key).optional().or(z.literal(''));

const assetFormSchema = z.object({
  categoryId: z.string().min(1, 'asset.validation.categoryRequired'),
  assetCode: z
    .string()
    .min(1, 'asset.validation.codeRequired')
    .max(50, 'asset.validation.codeMax')
    .regex(/^[A-Z0-9_-]+$/, 'asset.validation.codeFormat'),
  name: z
    .string()
    .min(1, 'asset.validation.nameRequired')
    .max(150, 'asset.validation.nameMax'),
  location: optionalText(120, 'asset.validation.locationMax'),
  serialNumber: optionalText(120, 'asset.validation.serialMax'),
  brand: optionalText(80, 'asset.validation.brandMax'),
  model: optionalText(80, 'asset.validation.modelMax'),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']).optional().or(z.literal('')),
  purchaseDate: z.string().optional().or(z.literal('')),
  purchaseCost: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'asset.validation.costInvalid'),
  warrantyEndDate: z.string().optional().or(z.literal('')),
  vendor: optionalText(120, 'asset.validation.vendorMax'),
  note: optionalText(1000, 'asset.validation.noteMax'),
});

export type AssetFormData = z.infer<typeof assetFormSchema>;

// Map form values → API payload: empty strings become null, cost becomes a number.
export function toAssetPayload(data: AssetFormData): CreateAssetInput {
  const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    categoryId: data.categoryId,
    assetCode: data.assetCode,
    name: data.name,
    location: orNull(data.location),
    serialNumber: orNull(data.serialNumber),
    brand: orNull(data.brand),
    model: orNull(data.model),
    condition: data.condition ? data.condition : null,
    purchaseDate: orNull(data.purchaseDate),
    purchaseCost: data.purchaseCost && data.purchaseCost.trim() ? Number(data.purchaseCost) : null,
    warrantyEndDate: orNull(data.warrantyEndDate),
    vendor: orNull(data.vendor),
    note: orNull(data.note),
  };
}

interface AssetFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetDto | null;
  onSubmit: (data: AssetFormData) => void;
  isLoading?: boolean;
}

const EMPTY: AssetFormData = {
  categoryId: '',
  assetCode: '',
  name: '',
  location: '',
  serialNumber: '',
  brand: '',
  model: '',
  condition: '',
  purchaseDate: '',
  purchaseCost: '',
  warrantyEndDate: '',
  vendor: '',
  note: '',
};

export function AssetFormSheet({
  open,
  onOpenChange,
  asset,
  onSubmit,
  isLoading,
}: AssetFormSheetProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const isEditing = !!asset;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: categories } = useAssetCategories();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (open) {
      setShowAdvanced(false);
      reset(
        asset
          ? {
              categoryId: asset.categoryId,
              assetCode: asset.assetCode,
              name: asset.name,
              location: asset.location ?? '',
              serialNumber: asset.serialNumber ?? '',
              brand: asset.brand ?? '',
              model: asset.model ?? '',
              condition: asset.condition ?? '',
              purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
              purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : '',
              warrantyEndDate: asset.warrantyEndDate ? asset.warrantyEndDate.slice(0, 10) : '',
              vendor: asset.vendor ?? '',
              note: asset.note ?? '',
            }
          : EMPTY,
      );
    }
  }, [open, asset, reset]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('asset.form.edit') : t('asset.form.create')}</SheetTitle>
          <SheetDescription>
            {isEditing ? t('asset.form.editDescription') : t('asset.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="asset-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">
              {t('asset.form.categoryLabel')} <span className="text-danger">*</span>
            </Label>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="categoryId"
                    className={errors.categoryId ? 'border-danger' : undefined}
                  >
                    <SelectValue placeholder={t('asset.form.categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.categoryId && (
              <p className="text-xs text-danger">{t(errors.categoryId.message!)}</p>
            )}
          </div>

          {/* Asset code */}
          <div className="space-y-1.5">
            <Label htmlFor="assetCode">
              {t('asset.form.codeLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="assetCode"
              placeholder={t('asset.form.codePlaceholder')}
              error={!!errors.assetCode}
              {...register('assetCode')}
            />
            {errors.assetCode && (
              <p className="text-xs text-danger">{t(errors.assetCode.message!)}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">
              {t('asset.form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="name"
              placeholder={t('asset.form.namePlaceholder')}
              error={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-danger">{t(errors.name.message!)}</p>}
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location">{t('asset.form.locationLabel')}</Label>
            <Input
              id="location"
              placeholder={t('asset.form.locationPlaceholder')}
              error={!!errors.location}
              {...register('location')}
            />
            {errors.location && (
              <p className="text-xs text-danger">{t(errors.location.message!)}</p>
            )}
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform', showAdvanced && 'rotate-90')}
            />
            {t('asset.form.advancedToggle')}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="brand">{t('asset.form.brandLabel')}</Label>
                  <Input id="brand" error={!!errors.brand} {...register('brand')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model">{t('asset.form.modelLabel')}</Label>
                  <Input id="model" error={!!errors.model} {...register('model')} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="serialNumber">{t('asset.form.serialLabel')}</Label>
                <Input
                  id="serialNumber"
                  error={!!errors.serialNumber}
                  {...register('serialNumber')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="condition">{t('asset.form.conditionLabel')}</Label>
                <Controller
                  name="condition"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="condition">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="purchaseDate">{t('asset.form.purchaseDateLabel')}</Label>
                  <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="purchaseCost">{t('asset.form.purchaseCostLabel')}</Label>
                  <Input
                    id="purchaseCost"
                    type="number"
                    min={0}
                    placeholder="0"
                    error={!!errors.purchaseCost}
                    {...register('purchaseCost')}
                  />
                  {errors.purchaseCost && (
                    <p className="text-xs text-danger">{t(errors.purchaseCost.message!)}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="warrantyEndDate">{t('asset.form.warrantyLabel')}</Label>
                  <Input id="warrantyEndDate" type="date" {...register('warrantyEndDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vendor">{t('asset.form.vendorLabel')}</Label>
                  <Input id="vendor" error={!!errors.vendor} {...register('vendor')} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note">{t('asset.form.noteLabel')}</Label>
                <Textarea id="note" error={!!errors.note} {...register('note')} />
              </div>
            </div>
          )}
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="asset-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('asset.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
