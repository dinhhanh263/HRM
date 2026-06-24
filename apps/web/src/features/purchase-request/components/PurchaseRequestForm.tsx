import { useEffect } from 'react';
import { useForm, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CreatePurchaseRequestRequest, PurchaseRequestDto } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
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
import { formatVnd } from '@/lib/utils';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useIssuingEntities } from '@/features/issuing-entities/hooks/useIssuingEntities';
import { lineSubtotal, lineTax, round2 } from '../utils';

const itemSchema = z.object({
  sku: z.string().optional(),
  productName: z.string().trim().min(1, 'form.validation.productNameRequired'),
  unit: z.string().optional(),
  quantity: z.coerce.number().positive('form.validation.quantityPositive'),
  unitPrice: z.coerce.number().min(0, 'form.validation.unitPriceNonNegative'),
  taxRate: z.coerce.number().min(0, 'form.validation.taxRateRange').max(100, 'form.validation.taxRateRange'),
});

const schema = z.object({
  title: z.string().trim().min(1, 'form.validation.titleRequired'),
  vendorName: z.string().trim().min(1, 'form.validation.vendorRequired'),
  expectedDeliveryDate: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  issuingEntityId: z.string().optional(),
  items: z.array(itemSchema).min(1, 'form.validation.itemsRequired'),
});

type FormData = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface PurchaseRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRequest?: PurchaseRequestDto | null; // present → resubmit mode
  isSubmitting?: boolean;
  onSubmit: (data: CreatePurchaseRequestRequest) => void;
}

const EMPTY_ITEM = { sku: '', productName: '', unit: '', quantity: 1, unitPrice: 0, taxRate: 8 };

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** Live totals footer — subscribes to the items field array via useWatch. */
function TotalsFooter({ control }: { control: Control<FormData> }) {
  const { t } = useTranslation('purchase');
  const items = useWatch({ control, name: 'items' }) ?? [];

  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const sub = lineSubtotal(Number(it?.quantity), Number(it?.unitPrice));
    subtotal += sub;
    vat += lineTax(sub, Number(it?.taxRate));
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  const total = round2(subtotal + vat);

  return (
    <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-lg border border-border bg-surface-alt/50 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{t('form.totals.subtotal')}</span>
        <span className="tabular-nums text-text-primary">{formatVnd(subtotal)} ₫</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{t('form.totals.vat')}</span>
        <span className="tabular-nums text-text-primary">{formatVnd(vat)} ₫</span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
        <span className="text-text-primary">{t('form.totals.total')}</span>
        <span className="tabular-nums text-text-primary">{formatVnd(total)} ₫</span>
      </div>
    </div>
  );
}

/** Per-row line subtotal (qty × unitPrice), recomputed live. */
function RowSubtotal({ control, index }: { control: Control<FormData>; index: number }) {
  const row = useWatch({ control, name: `items.${index}` });
  const sub = lineSubtotal(Number(row?.quantity), Number(row?.unitPrice));
  return <span className="tabular-nums text-text-primary">{formatVnd(sub)} ₫</span>;
}

export function PurchaseRequestForm({
  open,
  onOpenChange,
  initialRequest,
  isSubmitting,
  onSubmit,
}: PurchaseRequestFormProps) {
  const { t } = useTranslation('purchase');
  const isResubmit = !!initialRequest;

  // Only active entities are selectable; an empty list hides the field entirely.
  const { data: entities } = useIssuingEntities(true);
  const defaultEntityId = entities?.find((e) => e.isDefault)?.id;

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'VND', issuingEntityId: '', items: [EMPTY_ITEM] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (!open) return;
    if (initialRequest) {
      reset({
        title: initialRequest.title,
        vendorName: initialRequest.vendorName,
        expectedDeliveryDate: toDateInput(initialRequest.expectedDeliveryDate),
        description: initialRequest.description ?? '',
        currency: initialRequest.currency,
        issuingEntityId: initialRequest.issuingEntityId ?? '',
        items: (initialRequest.items ?? []).map((it) => ({
          sku: it.sku ?? '',
          productName: it.productName,
          unit: it.unit ?? '',
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          taxRate: Number(it.taxRate),
        })),
      });
    } else {
      reset({
        title: '',
        vendorName: '',
        expectedDeliveryDate: '',
        description: '',
        currency: 'VND',
        issuingEntityId: '',
        items: [{ ...EMPTY_ITEM }],
      });
    }
  }, [open, initialRequest, reset]);

  // Pre-select the default entity on a fresh create once the list resolves.
  const issuingEntityId = watch('issuingEntityId');
  useEffect(() => {
    if (!open || isResubmit) return;
    if (!issuingEntityId && defaultEntityId) {
      setValue('issuingEntityId', defaultEntityId);
    }
  }, [open, isResubmit, issuingEntityId, defaultEntityId, setValue]);

  function toIso(d?: string): string | undefined {
    return d ? new Date(`${d}T00:00:00.000Z`).toISOString() : undefined;
  }

  function submit(raw: FormData) {
    const data = raw as FormOutput;
    onSubmit({
      title: data.title.trim(),
      vendorName: data.vendorName.trim(),
      expectedDeliveryDate: toIso(data.expectedDeliveryDate),
      description: data.description?.trim() || undefined,
      currency: data.currency || 'VND',
      issuingEntityId: data.issuingEntityId || null,
      items: data.items.map((it) => ({
        sku: it.sku?.trim() || undefined,
        productName: it.productName.trim(),
        unit: it.unit?.trim() || undefined,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        taxRate: it.taxRate,
      })),
    });
  }

  function topError(key: 'title' | 'vendorName' | 'items') {
    const e = errors[key];
    const msg = Array.isArray(e) ? undefined : e?.message;
    if (!msg) return null;
    return (
      <p className="text-xs text-danger flex items-center gap-1">
        <AlertCircle className="size-3" />
        {t(msg as string)}
      </p>
    );
  }

  function itemError(index: number, key: keyof FormData['items'][number]) {
    const msg = errors.items?.[index]?.[key]?.message;
    if (!msg) return null;
    return <p className="mt-0.5 text-[11px] text-danger">{t(msg as string)}</p>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isResubmit ? t('form.resubmitTitle') : t('form.createTitle')}</SheetTitle>
          <SheetDescription>
            {isResubmit ? t('form.resubmitDescription') : t('form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(submit)} className="mt-6 flex-1 flex flex-col gap-5 overflow-y-auto pr-1">
          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pur-title">{t('form.title')} <span className="text-danger">*</span></Label>
              <Input id="pur-title" className="h-9 text-sm" placeholder={t('form.titlePlaceholder')} {...register('title')} />
              {topError('title')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pur-vendor">{t('form.vendorName')} <span className="text-danger">*</span></Label>
              <Input id="pur-vendor" className="h-9 text-sm" placeholder={t('form.vendorPlaceholder')} {...register('vendorName')} />
              {topError('vendorName')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pur-delivery">{t('form.expectedDeliveryDate')}</Label>
              <Input id="pur-delivery" type="date" className="h-9 text-sm" {...register('expectedDeliveryDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pur-currency">{t('form.currency')}</Label>
              <Input id="pur-currency" className="h-9 text-sm" {...register('currency')} />
            </div>
            {entities && entities.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pur-issuing-entity">{t('form.issuingEntity')}</Label>
                <Select
                  value={issuingEntityId || undefined}
                  onValueChange={(v) => setValue('issuingEntityId', v, { shouldDirty: true })}
                >
                  <SelectTrigger id="pur-issuing-entity" className="h-9 text-sm">
                    <SelectValue placeholder={t('form.issuingEntityPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pur-description">{t('form.description')}</Label>
              <Textarea id="pur-description" rows={2} placeholder={t('form.descriptionPlaceholder')} {...register('description')} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('form.items.title')} <span className="text-danger">*</span></Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...EMPTY_ITEM })}
              >
                <Plus className="mr-1.5 size-4" />
                {t('form.items.addRow')}
              </Button>
            </div>
            {topError('items')}

            {/* One card per line so every field gets a full-width input — a 7-column
                table is unreadable inside the side sheet (inputs clipped long text/numbers). */}
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-7 w-5 shrink-0 text-sm font-medium text-text-muted tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor={`pur-item-name-${index}`}>
                        {t('form.items.productName')} <span className="text-danger">*</span>
                      </Label>
                      <Input
                        id={`pur-item-name-${index}`}
                        className="h-9 text-sm"
                        placeholder={t('form.items.productNamePlaceholder')}
                        {...register(`items.${index}.productName`)}
                      />
                      {itemError(index, 'productName')}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6 size-9 shrink-0 text-danger hover:text-danger"
                      aria-label={t('form.items.removeRow')}
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:pl-8">
                    <div className="space-y-1.5">
                      <Label htmlFor={`pur-item-sku-${index}`}>{t('form.items.sku')}</Label>
                      <Input id={`pur-item-sku-${index}`} className="h-9 text-sm" {...register(`items.${index}.sku`)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pur-item-unit-${index}`}>{t('form.items.unit')}</Label>
                      <Input id={`pur-item-unit-${index}`} className="h-9 text-sm" {...register(`items.${index}.unit`)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pur-item-qty-${index}`}>{t('form.items.quantity')}</Label>
                      <Input
                        id={`pur-item-qty-${index}`}
                        type="number"
                        min={0}
                        step="any"
                        className="h-9 text-sm tabular-nums text-right"
                        {...register(`items.${index}.quantity`)}
                      />
                      {itemError(index, 'quantity')}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pur-item-price-${index}`}>{t('form.items.unitPrice')}</Label>
                      <Input
                        id={`pur-item-price-${index}`}
                        type="number"
                        min={0}
                        step="any"
                        className="h-9 text-sm tabular-nums text-right"
                        {...register(`items.${index}.unitPrice`)}
                      />
                      {itemError(index, 'unitPrice')}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pur-item-tax-${index}`}>{t('form.items.taxRate')}</Label>
                      <Input
                        id={`pur-item-tax-${index}`}
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        className="h-9 text-sm tabular-nums text-right"
                        {...register(`items.${index}.taxRate`)}
                      />
                      {itemError(index, 'taxRate')}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('form.items.lineSubtotal')}</Label>
                      <div className="flex h-9 items-center justify-end rounded-md border border-border bg-surface-alt/50 px-3 text-sm">
                        <RowSubtotal control={control} index={index} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <TotalsFooter control={control} />
          </div>

          {!isResubmit && (
            <p className="text-xs text-text-muted rounded-md bg-surface-alt px-3 py-2">
              {t('form.attachmentsHint')}
            </p>
          )}

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('actions.submitting')
                : isResubmit
                  ? t('actions.resubmit')
                  : t('actions.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
