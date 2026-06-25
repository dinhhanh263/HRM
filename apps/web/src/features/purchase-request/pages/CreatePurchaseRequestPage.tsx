import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CreatePurchaseRequestRequest } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { formatVnd } from '@/lib/utils';
import { getApiErrorCode } from '@/lib/api-error';
import { ArrowLeft, FileText, ListPlus, Plus, Trash2, Save, X, AlertCircle } from 'lucide-react';
import { useIssuingEntities } from '@/features/issuing-entities/hooks/useIssuingEntities';
import { lineSubtotal, lineTax, round2 } from '../utils';
import {
  usePurchaseRequest,
  useCreatePurchaseRequest,
  useResubmitPurchaseRequest,
} from '../hooks/usePurchaseRequests';

const itemSchema = z.object({
  sku: z.string().optional(),
  productName: z.string().trim().min(1, 'form.validation.productNameRequired'),
  unit: z.string().optional(),
  quantity: z.coerce.number().positive('form.validation.quantityPositive'),
  unitPrice: z.coerce.number().min(0, 'form.validation.unitPriceNonNegative'),
  taxRate: z.coerce
    .number()
    .min(0, 'form.validation.taxRateRange')
    .max(100, 'form.validation.taxRateRange'),
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

const EMPTY_ITEM = { sku: '', productName: '', unit: '', quantity: 1, unitPrice: 0, taxRate: 8 };

// Shared grid track so the header row and every item row align column-for-column.
const ITEM_GRID =
  'grid grid-cols-[1.5rem_minmax(8rem,1fr)_6rem_4rem_5rem_7.5rem_4.5rem_7.5rem_2rem] gap-2 items-start';

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function toIso(d?: string): string | undefined {
  return d ? new Date(`${d}T00:00:00.000Z`).toISOString() : undefined;
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

const moneyFormatter = new Intl.NumberFormat('vi-VN');

interface MoneyInputProps {
  value: number | string | undefined;
  onChange: (value: number | '') => void;
  onBlur?: () => void;
  name?: string;
  className?: string;
  error?: boolean;
}

/** Integer money field that shows thousand separators (vi-VN) while typing.
    Stores the raw number on the form; an empty field maps to '' (→ 0 on submit). */
function MoneyInput({ value, onChange, onBlur, name, className, error }: MoneyInputProps) {
  const display =
    value === '' || value === undefined || value === null || Number.isNaN(Number(value))
      ? ''
      : moneyFormatter.format(Number(value));
  return (
    <Input
      inputMode="numeric"
      name={name}
      className={className}
      error={error}
      value={display}
      onBlur={onBlur}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(digits === '' ? '' : Number(digits));
      }}
    />
  );
}

export function CreatePurchaseRequestPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('purchase');
  const { id } = useParams<{ id?: string }>();
  const isResubmit = !!id;

  // Resubmit mode loads the existing request to pre-fill the form.
  const { data: initialRequest, isLoading: isLoadingRequest } = usePurchaseRequest(id ?? null);

  // Only active entities are selectable; an empty list hides the field entirely.
  const { data: entities } = useIssuingEntities(true);
  const defaultEntityId = entities?.find((e) => e.isDefault)?.id;

  const createMutation = useCreatePurchaseRequest();
  const resubmitMutation = useResubmitPurchaseRequest();
  const isSubmitting = createMutation.isPending || resubmitMutation.isPending;

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
    defaultValues: { currency: 'VND', issuingEntityId: '', items: [{ ...EMPTY_ITEM }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Hydrate the form once the request to resubmit resolves.
  useEffect(() => {
    if (!isResubmit || !initialRequest) return;
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
  }, [isResubmit, initialRequest, reset]);

  // Pre-select the default entity on a fresh create once the list resolves.
  const issuingEntityId = watch('issuingEntityId');
  useEffect(() => {
    if (isResubmit) return;
    if (!issuingEntityId && defaultEntityId) {
      setValue('issuingEntityId', defaultEntityId);
    }
  }, [isResubmit, issuingEntityId, defaultEntityId, setValue]);

  function onError(error: unknown) {
    const code = getApiErrorCode(error);
    toast.error((code && t(`toast.errors.${code}`, { defaultValue: '' })) || t('toast.tryAgain'));
  }

  function submit(raw: FormData) {
    const data = raw as FormOutput;
    const payload: CreatePurchaseRequestRequest = {
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
    };

    if (isResubmit && id) {
      resubmitMutation.mutate(
        { id, data: payload },
        {
          onSuccess: () => {
            toast.success(t('toast.resubmitted'));
            navigate('/purchase-requests');
          },
          onError,
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          toast.success(t('toast.created'));
          // Open the new request's detail so the user can attach quotes/contracts right away.
          navigate(`/purchase-requests?detail=${created.id}`);
        },
        onError,
      });
    }
  }

  function topError(key: 'title' | 'vendorName' | 'items') {
    const e = errors[key];
    const msg = Array.isArray(e) ? undefined : e?.message;
    if (!msg) return null;
    return (
      <span className="text-xs text-danger flex items-center gap-1 mt-1">
        <AlertCircle className="size-3" />
        {t(msg as string)}
      </span>
    );
  }

  function itemError(index: number, key: keyof FormData['items'][number]) {
    const msg = errors.items?.[index]?.[key]?.message;
    if (!msg) return null;
    return <span className="mt-0.5 text-[11px] text-danger">{t(msg as string)}</span>;
  }

  // Show a skeleton while a resubmit target is still loading.
  if (isResubmit && isLoadingRequest) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2 mb-4 bg-transparent border-none text-text-secondary text-sm font-medium cursor-pointer rounded-lg transition-all duration-150 hover:bg-surface-alt hover:text-text-primary"
          onClick={() => navigate('/purchase-requests')}
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
          {t('form.backToList')}
        </button>
        <h1 className="text-2xl font-bold text-text-primary m-0">
          {isResubmit ? t('form.resubmitTitle') : t('form.createTitle')}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {isResubmit ? t('form.resubmitDescription') : t('form.createDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-6">
        {/* Section 1: Request info */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center">
              <FileText className="w-[18px] h-[18px] text-primary" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary m-0">
                {t('form.sections.info')}
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('form.sections.infoDescription')}
              </p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Title */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[13px] font-medium text-text-primary">
                  {t('form.title')} <span className="text-danger">*</span>
                </label>
                <Input
                  className="h-[42px]"
                  placeholder={t('form.titlePlaceholder')}
                  error={!!errors.title}
                  {...register('title')}
                />
                {topError('title')}
              </div>

              {/* Vendor */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary">
                  {t('form.vendorName')} <span className="text-danger">*</span>
                </label>
                <Input
                  className="h-[42px]"
                  placeholder={t('form.vendorPlaceholder')}
                  error={!!errors.vendorName}
                  {...register('vendorName')}
                />
                {topError('vendorName')}
              </div>

              {/* Expected delivery date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary">
                  {t('form.expectedDeliveryDate')}
                </label>
                <Input type="date" className="h-[42px]" {...register('expectedDeliveryDate')} />
              </div>

              {/* Currency */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary">
                  {t('form.currency')}
                </label>
                <Input className="h-[42px]" {...register('currency')} />
              </div>

              {/* Issuing entity */}
              {entities && entities.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-text-primary">
                    {t('form.issuingEntity')}
                  </label>
                  <Select
                    value={issuingEntityId || undefined}
                    onValueChange={(v) => setValue('issuingEntityId', v, { shouldDirty: true })}
                  >
                    <SelectTrigger className="h-[42px]">
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

              {/* Description */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[13px] font-medium text-text-primary">
                  {t('form.description')}
                </label>
                <Textarea
                  rows={2}
                  placeholder={t('form.descriptionPlaceholder')}
                  {...register('description')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Line items */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-success-light flex items-center justify-center">
              <ListPlus className="w-[18px] h-[18px] text-success" />
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-text-primary m-0">
                {t('form.sections.items')}
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('form.sections.itemsDescription')}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_ITEM })}>
              <Plus className="mr-1.5 size-4" />
              {t('form.items.addRow')}
            </Button>
          </div>

          <div className="p-6 space-y-3">
            {topError('items')}

            {/* Single-row-per-item table. Horizontal scroll keeps every field on one
                line on narrow viewports instead of wrapping to a second row. */}
            <div className="overflow-x-auto">
              <div className="min-w-[760px] space-y-2">
                {/* Header */}
                <div
                  className={`${ITEM_GRID} px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary`}
                >
                  <span className="text-center">#</span>
                  <span>
                    {t('form.items.productName')} <span className="text-danger">*</span>
                  </span>
                  <span>{t('form.items.sku')}</span>
                  <span>{t('form.items.unit')}</span>
                  <span className="text-right">{t('form.items.quantity')}</span>
                  <span className="text-right">{t('form.items.unitPrice')}</span>
                  <span className="text-right">{t('form.items.taxRate')}</span>
                  <span className="text-right">{t('form.items.lineSubtotal')}</span>
                  <span />
                </div>

                {/* Rows */}
                {fields.map((field, index) => (
                  <div key={field.id} className={`${ITEM_GRID} rounded-lg bg-surface-alt/30 p-2`}>
                    <span className="pt-2.5 text-center text-sm font-medium text-text-muted tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex flex-col">
                      <Input
                        className="h-9 text-sm"
                        placeholder={t('form.items.productNamePlaceholder')}
                        error={!!errors.items?.[index]?.productName}
                        {...register(`items.${index}.productName`)}
                      />
                      {itemError(index, 'productName')}
                    </div>
                    <div className="flex flex-col">
                      <Input className="h-9 text-sm" {...register(`items.${index}.sku`)} />
                    </div>
                    <div className="flex flex-col">
                      <Input className="h-9 text-sm" {...register(`items.${index}.unit`)} />
                    </div>
                    <div className="flex flex-col">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-9 text-sm tabular-nums text-right"
                        error={!!errors.items?.[index]?.quantity}
                        {...register(`items.${index}.quantity`)}
                      />
                      {itemError(index, 'quantity')}
                    </div>
                    <div className="flex flex-col">
                      <Controller
                        control={control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <MoneyInput
                            name={field.name}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            className="h-9 text-sm tabular-nums text-right"
                            error={!!errors.items?.[index]?.unitPrice}
                          />
                        )}
                      />
                      {itemError(index, 'unitPrice')}
                    </div>
                    <div className="flex flex-col">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        className="h-9 text-sm tabular-nums text-right"
                        error={!!errors.items?.[index]?.taxRate}
                        {...register(`items.${index}.taxRate`)}
                      />
                      {itemError(index, 'taxRate')}
                    </div>
                    <div className="flex h-9 items-center justify-end rounded-md border border-border bg-surface px-3 text-sm">
                      <RowSubtotal control={control} index={index} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-danger hover:text-danger"
                      aria-label={t('form.items.removeRow')}
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <TotalsFooter control={control} />

            {!isResubmit && (
              <p className="text-xs text-text-muted rounded-md bg-surface-alt px-3 py-2">
                {t('form.attachmentsHint')}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/purchase-requests')}
            className="min-w-[120px]"
          >
            <X className="w-[18px] h-[18px] mr-2" />
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-[160px]">
            {isSubmitting ? (
              <>
                <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                {t('actions.submitting')}
              </>
            ) : (
              <>
                <Save className="w-[18px] h-[18px] mr-2" />
                {isResubmit ? t('actions.resubmit') : t('actions.submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
