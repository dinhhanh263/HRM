import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { AssetCondition, AssignAssetInput } from '@hrm/shared';
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
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { SignaturePad } from './SignaturePad';

const CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

const assignFormSchema = z.object({
  employeeId: z.string().min(1, 'asset.assign.validation.employeeRequired'),
  assignedAt: z.string().min(1, 'asset.assign.validation.dateRequired'),
  conditionOut: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']).optional().or(z.literal('')),
  note: z.string().max(1000, 'asset.assign.validation.noteMax').optional().or(z.literal('')),
});

type AssignFormData = z.infer<typeof assignFormSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AssignAssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AssignAssetInput) => void;
  isLoading?: boolean;
}

export function AssignAssetSheet({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AssignAssetSheetProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [signOnAssign, setSignOnAssign] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const { data: employees } = useEmployees({ status: 'ACTIVE', limit: 100, search: employeeSearch || undefined });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AssignFormData>({
    resolver: zodResolver(assignFormSchema),
    defaultValues: { employeeId: '', assignedAt: today(), conditionOut: '', note: '' },
  });

  useEffect(() => {
    if (open) {
      setEmployeeSearch('');
      setSignOnAssign(false);
      setSignature(null);
      reset({ employeeId: '', assignedAt: today(), conditionOut: '', note: '' });
    }
  }, [open, reset]);

  function submit(data: AssignFormData) {
    // Chữ ký chỉ gửi khi bật "ký tại chỗ" và đã có nét → biên bản SIGNED/ON_SCREEN.
    const signed = signOnAssign && signature != null;
    onSubmit({
      employeeId: data.employeeId,
      assignedAt: data.assignedAt,
      conditionOut: data.conditionOut ? data.conditionOut : null,
      note: data.note && data.note.trim() ? data.note.trim() : null,
      signature: signed ? signature : null,
      ackMethod: signed ? 'ON_SCREEN' : null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('asset.assign.title')}</SheetTitle>
          <SheetDescription>{t('asset.assign.description')}</SheetDescription>
        </SheetHeader>

        <form
          id="assign-form"
          onSubmit={handleSubmit(submit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {/* Employee */}
          <div className="space-y-1.5">
            <Label htmlFor="employeeId">
              {t('asset.assign.employeeLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              placeholder={t('asset.assign.employeeSearchPlaceholder')}
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="mb-2 h-8 text-xs"
            />
            <Controller
              name="employeeId"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="employeeId"
                    className={errors.employeeId ? 'border-danger' : undefined}
                  >
                    <SelectValue placeholder={t('asset.assign.employeePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.data.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.fullName} · {emp.employeeCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.employeeId && (
              <p className="text-xs text-danger">{t(errors.employeeId.message!)}</p>
            )}
          </div>

          {/* Assigned date */}
          <div className="space-y-1.5">
            <Label htmlFor="assignedAt">
              {t('asset.assign.dateLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="assignedAt"
              type="date"
              error={!!errors.assignedAt}
              {...register('assignedAt')}
            />
            {errors.assignedAt && (
              <p className="text-xs text-danger">{t(errors.assignedAt.message!)}</p>
            )}
          </div>

          {/* Condition out */}
          <div className="space-y-1.5">
            <Label htmlFor="conditionOut">{t('asset.assign.conditionLabel')}</Label>
            <Controller
              name="conditionOut"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="conditionOut">
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
            <Label htmlFor="note">{t('asset.assign.noteLabel')}</Label>
            <Textarea
              id="note"
              placeholder={t('asset.assign.notePlaceholder')}
              error={!!errors.note}
              {...register('note')}
            />
            {errors.note && <p className="text-xs text-danger">{t(errors.note.message!)}</p>}
          </div>

          {/* On-screen signature capture (ON_SCREEN handover ack) */}
          <div className="space-y-3 rounded-lg border border-border bg-surface-alt/40 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={signOnAssign}
                onChange={(e) => {
                  setSignOnAssign(e.target.checked);
                  if (!e.target.checked) setSignature(null);
                }}
                className="mt-0.5 size-4 rounded border-border accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t('asset.handover.signOnAssign')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('asset.handover.signOnAssignHint')}
                </span>
              </span>
            </label>
            {signOnAssign && (
              <SignaturePad
                onChange={setSignature}
                className="animate-in fade-in-0 slide-in-from-top-1 duration-150"
              />
            )}
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="assign-form" disabled={isLoading}>
            {isLoading ? tc('states.saving') : t('asset.assign.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
