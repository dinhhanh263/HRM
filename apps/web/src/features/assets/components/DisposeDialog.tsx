import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { DisposeAssetInput } from '@hrm/shared';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const disposeFormSchema = z.object({
  status: z.enum(['RETIRED', 'LOST']),
  retiredAt: z.string().min(1, 'asset.dispose.validation.dateRequired'),
  reason: z
    .string()
    .min(1, 'asset.dispose.validation.reasonRequired')
    .max(500, 'asset.dispose.validation.reasonMax'),
});

type DisposeFormData = z.infer<typeof disposeFormSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DisposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: DisposeAssetInput) => void;
  isLoading?: boolean;
}

export function DisposeDialog({ open, onOpenChange, onSubmit, isLoading }: DisposeDialogProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DisposeFormData>({
    resolver: zodResolver(disposeFormSchema),
    defaultValues: { status: 'RETIRED', retiredAt: today(), reason: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ status: 'RETIRED', retiredAt: today(), reason: '' });
    }
  }, [open, reset]);

  function submit(data: DisposeFormData) {
    onSubmit({ status: data.status, retiredAt: data.retiredAt, reason: data.reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('asset.dispose.title')}</DialogTitle>
          <DialogDescription>{t('asset.dispose.description')}</DialogDescription>
        </DialogHeader>

        <form id="dispose-form" onSubmit={handleSubmit(submit)} className="space-y-4">
          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="status">
              {t('asset.dispose.statusLabel')} <span className="text-danger">*</span>
            </Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RETIRED">{t('status.RETIRED')}</SelectItem>
                    <SelectItem value="LOST">{t('status.LOST')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Retired date */}
          <div className="space-y-1.5">
            <Label htmlFor="retiredAt">
              {t('asset.dispose.dateLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="retiredAt"
              type="date"
              error={!!errors.retiredAt}
              {...register('retiredAt')}
            />
            {errors.retiredAt && (
              <p className="text-xs text-danger">{t(errors.retiredAt.message!)}</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              {t('asset.dispose.reasonLabel')} <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder={t('asset.dispose.reasonPlaceholder')}
              error={!!errors.reason}
              {...register('reason')}
            />
            {errors.reason && <p className="text-xs text-danger">{t(errors.reason.message!)}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            type="submit"
            form="dispose-form"
            disabled={isLoading}
            className="bg-danger text-white hover:bg-danger/90"
          >
            {isLoading ? tc('states.saving') : t('asset.dispose.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
