import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CreateLeaveRequestRequest, LeaveTypeDto, LeaveRequestDto } from '@hrm/shared';
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
import { AlertCircle } from 'lucide-react';

const schema = z
  .object({
    leaveTypeId: z.string().min(1, 'form.validation.leaveTypeRequired'),
    startDate: z.string().min(1, 'form.validation.startRequired'),
    endDate: z.string().min(1, 'form.validation.endRequired'),
    halfDay: z.boolean().optional(),
    reason: z.string().optional(),
    attachmentUrl: z
      .string()
      .url('form.validation.attachmentUrlInvalid')
      .optional()
      .or(z.literal('')),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'form.validation.endBeforeStart',
    path: ['endDate'],
  });

type FormData = z.infer<typeof schema>;

interface LeaveRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveTypes: LeaveTypeDto[];
  onSubmit: (data: CreateLeaveRequestRequest) => void;
  isSubmitting?: boolean;
  /** When set, the form prefills from this request and acts as a "resubmit" form. */
  initialRequest?: LeaveRequestDto | null;
}

export function LeaveRequestForm({
  open,
  onOpenChange,
  leaveTypes,
  onSubmit,
  isSubmitting,
  initialRequest,
}: LeaveRequestFormProps) {
  const { t } = useTranslation('leave');
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
    defaultValues: { halfDay: false },
  });

  // Prefill (resubmit) / clear (fresh create) whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    if (initialRequest) {
      reset({
        leaveTypeId: initialRequest.leaveTypeId,
        startDate: initialRequest.startDate.slice(0, 10),
        endDate: initialRequest.endDate.slice(0, 10),
        halfDay: initialRequest.halfDay,
        reason: initialRequest.reason ?? '',
        attachmentUrl: initialRequest.attachmentUrl ?? '',
      });
    } else {
      reset({ halfDay: false, leaveTypeId: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' });
    }
  }, [open, initialRequest, reset]);

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const leaveTypeId = watch('leaveTypeId');
  const halfDay = watch('halfDay');
  const sameDay = !!startDate && startDate === endDate;
  const selectedType = leaveTypes.find((lt) => lt.id === leaveTypeId);

  function submit(data: FormData) {
    onSubmit({
      leaveTypeId: data.leaveTypeId,
      startDate: new Date(`${data.startDate}T00:00:00.000Z`).toISOString(),
      endDate: new Date(`${data.endDate}T00:00:00.000Z`).toISOString(),
      halfDay: sameDay ? data.halfDay : false,
      reason: data.reason || undefined,
      attachmentUrl: data.attachmentUrl || undefined,
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset({ halfDay: false });
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isResubmit ? t('form.resubmitTitle') : t('form.title')}</SheetTitle>
          <SheetDescription>
            {isResubmit ? t('form.resubmitDescription') : t('form.description')}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(submit)}
          className="mt-6 flex-1 flex flex-col gap-4 overflow-y-auto"
        >
          {/* Leave type */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t('form.leaveType')} <span className="text-danger">*</span>
            </Label>
            <Select
              value={leaveTypeId || ''}
              onValueChange={(v) =>
                setValue('leaveTypeId', v, { shouldValidate: true })
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t('form.leaveTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.leaveTypeId && (
              <p className="text-xs text-danger flex items-center gap-1">
                <AlertCircle className="size-3" />
                {t(errors.leaveTypeId.message as string)}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate" className="text-sm font-medium">
                {t('form.startDate')} <span className="text-danger">*</span>
              </Label>
              <Input id="startDate" type="date" className="h-9 text-sm" {...register('startDate')} />
              {errors.startDate && (
                <p className="text-xs text-danger flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {t(errors.startDate.message as string)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate" className="text-sm font-medium">
                {t('form.endDate')} <span className="text-danger">*</span>
              </Label>
              <Input id="endDate" type="date" className="h-9 text-sm" {...register('endDate')} />
              {errors.endDate && (
                <p className="text-xs text-danger flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {t(errors.endDate.message as string)}
                </p>
              )}
            </div>
          </div>

          {/* Half day — only when single day */}
          {sameDay && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-primary"
                checked={!!halfDay}
                onChange={(e) => setValue('halfDay', e.target.checked)}
              />
              <span className="text-sm text-text-primary">{t('form.halfDay')}</span>
              <span className="text-xs text-text-muted">{t('form.halfDayHint')}</span>
            </label>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-sm font-medium">
              {t('form.reason')}
            </Label>
            <Textarea
              id="reason"
              rows={3}
              placeholder={t('form.reasonPlaceholder')}
              {...register('reason')}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-1.5">
            <Label htmlFor="attachmentUrl" className="text-sm font-medium">
              {t('form.attachmentUrl')}
              {selectedType?.requiresAttachment && <span className="text-danger"> *</span>}
            </Label>
            <Input
              id="attachmentUrl"
              type="url"
              placeholder="https://..."
              className="h-9 text-sm"
              {...register('attachmentUrl')}
            />
            {selectedType?.requiresAttachment && (
              <p className="text-xs text-text-muted">{t('form.attachmentRequired')}</p>
            )}
            {errors.attachmentUrl && (
              <p className="text-xs text-danger flex items-center gap-1">
                <AlertCircle className="size-3" />
                {t(errors.attachmentUrl.message as string)}
              </p>
            )}
          </div>

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('actions.cancel', { ns: 'common' })}
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
