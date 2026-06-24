import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CreatePaymentRequestRequest, PaymentRequestDto, PaymentRequestType } from '@hrm/shared';
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
import { AlertCircle } from 'lucide-react';

const schema = z
  .object({
    type: z.enum(['REIMBURSEMENT', 'ADVANCE', 'VENDOR_PAYMENT']),
    title: z.string().trim().min(1, 'form.validation.titleRequired'),
    amount: z.coerce.number().positive('form.validation.amountPositive'),
    currency: z.string().optional(),
    description: z.string().optional(),
    expenseDate: z.string().optional(),
    category: z.string().optional(),
    neededByDate: z.string().optional(),
    vendorName: z.string().optional(),
    invoiceNumber: z.string().optional(),
    dueDate: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'REIMBURSEMENT' && !d.expenseDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'form.validation.expenseDateRequired', path: ['expenseDate'] });
    }
    if (d.type === 'VENDOR_PAYMENT' && !d.vendorName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'form.validation.vendorRequired', path: ['vendorName'] });
    }
  });

type FormData = z.infer<typeof schema>;

interface PaymentRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRequest?: PaymentRequestDto | null; // present → resubmit mode (type fixed)
  isSubmitting?: boolean;
  onSubmit: (data: CreatePaymentRequestRequest) => void;
}

const TYPES: PaymentRequestType[] = ['REIMBURSEMENT', 'ADVANCE', 'VENDOR_PAYMENT'];

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function PaymentRequestForm({
  open,
  onOpenChange,
  initialRequest,
  isSubmitting,
  onSubmit,
}: PaymentRequestFormProps) {
  const { t } = useTranslation('payment');
  const isResubmit = !!initialRequest;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'REIMBURSEMENT', currency: 'VND' },
  });

  const type = watch('type');
  const amount = watch('amount');

  useEffect(() => {
    if (!open) return;
    if (initialRequest) {
      reset({
        type: initialRequest.type,
        title: initialRequest.title,
        amount: Number(initialRequest.amount),
        currency: initialRequest.currency,
        description: initialRequest.description ?? '',
        expenseDate: toDateInput(initialRequest.expenseDate),
        category: initialRequest.category ?? '',
        neededByDate: toDateInput(initialRequest.neededByDate),
        vendorName: initialRequest.vendorName ?? '',
        invoiceNumber: initialRequest.invoiceNumber ?? '',
        dueDate: toDateInput(initialRequest.dueDate),
      });
    } else {
      reset({ type: 'REIMBURSEMENT', currency: 'VND', title: '', description: '' });
    }
  }, [open, initialRequest, reset]);

  function toIso(d?: string): string | undefined {
    return d ? new Date(`${d}T00:00:00.000Z`).toISOString() : undefined;
  }

  function submit(data: FormData) {
    onSubmit({
      type: data.type,
      title: data.title.trim(),
      amount: data.amount,
      currency: data.currency || 'VND',
      description: data.description || undefined,
      expenseDate: data.type === 'REIMBURSEMENT' ? toIso(data.expenseDate) : undefined,
      category: data.type === 'REIMBURSEMENT' ? data.category || undefined : undefined,
      neededByDate: data.type === 'ADVANCE' ? toIso(data.neededByDate) : undefined,
      vendorName: data.type === 'VENDOR_PAYMENT' ? data.vendorName || undefined : undefined,
      invoiceNumber: data.type === 'VENDOR_PAYMENT' ? data.invoiceNumber || undefined : undefined,
      dueDate: data.type === 'VENDOR_PAYMENT' ? toIso(data.dueDate) : undefined,
    });
  }

  function fieldError(key: keyof FormData) {
    const e = errors[key];
    if (!e?.message) return null;
    return (
      <p className="text-xs text-danger flex items-center gap-1">
        <AlertCircle className="size-3" />
        {t(e.message as string)}
      </p>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isResubmit ? t('form.resubmitTitle') : t('form.createTitle')}</SheetTitle>
          <SheetDescription>
            {isResubmit ? t('form.resubmitDescription') : t('form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(submit)} className="mt-6 flex-1 flex flex-col gap-4 overflow-y-auto">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>{t('form.type')} <span className="text-danger">*</span></Label>
            <Select
              value={type}
              onValueChange={(v) => setValue('type', v as PaymentRequestType, { shouldValidate: true })}
              disabled={isResubmit}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>{t(`type.${ty}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">{t(`typeDesc.${type}`)}</p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="pr-title">{t('form.title')} <span className="text-danger">*</span></Label>
            <Input id="pr-title" className="h-9 text-sm" placeholder={t('form.titlePlaceholder')} {...register('title')} />
            {fieldError('title')}
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pr-amount">{t('form.amount')} <span className="text-danger">*</span></Label>
              <Input id="pr-amount" type="number" min={0} step={1000} className="h-9 text-sm tabular-nums" {...register('amount')} />
              {Number.isFinite(amount) && amount > 0 ? (
                <p className="text-xs text-text-muted tabular-nums">{formatVnd(amount)} ₫</p>
              ) : (
                fieldError('amount')
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-currency">{t('form.currency')}</Label>
              <Input id="pr-currency" className="h-9 text-sm" {...register('currency')} />
            </div>
          </div>

          {/* Type-specific */}
          {type === 'REIMBURSEMENT' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pr-expenseDate">{t('form.expenseDate')} <span className="text-danger">*</span></Label>
                <Input id="pr-expenseDate" type="date" className="h-9 text-sm" {...register('expenseDate')} />
                {fieldError('expenseDate')}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-category">{t('form.category')}</Label>
                <Input id="pr-category" className="h-9 text-sm" placeholder={t('form.categoryPlaceholder')} {...register('category')} />
              </div>
            </>
          )}
          {type === 'ADVANCE' && (
            <div className="space-y-1.5">
              <Label htmlFor="pr-neededByDate">{t('form.neededByDate')}</Label>
              <Input id="pr-neededByDate" type="date" className="h-9 text-sm" {...register('neededByDate')} />
            </div>
          )}
          {type === 'VENDOR_PAYMENT' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pr-vendor">{t('form.vendorName')} <span className="text-danger">*</span></Label>
                <Input id="pr-vendor" className="h-9 text-sm" {...register('vendorName')} />
                {fieldError('vendorName')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-invoice">{t('form.invoiceNumber')}</Label>
                  <Input id="pr-invoice" className="h-9 text-sm" {...register('invoiceNumber')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-dueDate">{t('form.dueDate')}</Label>
                  <Input id="pr-dueDate" type="date" className="h-9 text-sm" {...register('dueDate')} />
                </div>
              </div>
            </>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="pr-description">{t('form.description')}</Label>
            <Textarea id="pr-description" rows={3} placeholder={t('form.descriptionPlaceholder')} {...register('description')} />
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
