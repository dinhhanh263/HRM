import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { DepartmentDto } from '@hrm/shared';
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

// Sentinel for the "no department head" Select option — Radix forbids empty-string values.
const NO_MANAGER = '__none__';

const departmentFormSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired').max(100, 'validation.nameMax'),
  description: z.string().max(500, 'validation.descriptionMax').optional(),
  managerId: z.string().optional(),
});

export type DepartmentFormData = z.infer<typeof departmentFormSchema>;

interface DepartmentFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: DepartmentDto | null;
  onSubmit: (data: DepartmentFormData) => void;
  isLoading?: boolean;
}

export function DepartmentFormSheet({
  open,
  onOpenChange,
  department,
  onSubmit,
  isLoading,
}: DepartmentFormSheetProps) {
  const { t } = useTranslation('department');
  const { t: tc } = useTranslation('common');
  const isEditing = !!department;
  const { data: employeesResult } = useEmployees({ limit: 100, status: 'ACTIVE' });
  const managerOptions = employeesResult?.data ?? [];

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: '', description: '', managerId: undefined },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: department?.name ?? '',
        description: department?.description ?? '',
        managerId: department?.managerId ?? undefined,
      });
    }
  }, [open, department, reset]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('form.edit') : t('form.create')}</SheetTitle>
          <SheetDescription>
            {isEditing ? t('form.editDescription') : t('form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="department-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-4"
        >
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
            {errors.name && <p className="text-xs text-danger">{t(errors.name.message!)}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{t('form.descriptionLabel')}</Label>
            <Textarea
              id="description"
              placeholder={t('form.descriptionPlaceholder')}
              error={!!errors.description}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-danger">{t(errors.description.message!)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="managerId">{t('form.managerLabel')}</Label>
            <Controller
              name="managerId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || NO_MANAGER}
                  onValueChange={(value) =>
                    field.onChange(value === NO_MANAGER ? undefined : value)
                  }
                >
                  <SelectTrigger id="managerId">
                    <SelectValue placeholder={t('form.managerPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MANAGER}>{t('form.noManager')}</SelectItem>
                    {managerOptions.map((mgr) => (
                      <SelectItem key={mgr.id} value={mgr.id}>
                        {mgr.fullName} · {mgr.employeeCode}
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
          <Button type="submit" form="department-form" disabled={isLoading}>
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
