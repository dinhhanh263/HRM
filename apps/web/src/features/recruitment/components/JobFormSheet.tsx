import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type {
  JobDto,
  DepartmentDto,
  PositionDto,
  PipelineTemplateDto,
  JobEmploymentType,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export const NONE_VALUE = 'none';

const EMPLOYMENT_TYPES: JobEmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export interface JobFormData {
  title: string;
  description: string;
  departmentId: string;
  positionId: string;
  employmentType: JobEmploymentType;
  location: string;
  headcount: number;
  pipelineTemplateId: string;
  status: 'DRAFT' | 'OPEN';
}

interface JobFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: JobDto | null;
  departments: DepartmentDto[];
  positions: PositionDto[];
  templates: PipelineTemplateDto[];
  onSubmit: (data: JobFormData) => void;
  isLoading?: boolean;
}

export function JobFormSheet({
  open,
  onOpenChange,
  job,
  departments,
  positions,
  templates,
  onSubmit,
  isLoading,
}: JobFormSheetProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const isEditing = !!job;

  const defaultTemplateId = useMemo(
    () => templates.find((tpl) => tpl.isDefault)?.id ?? templates[0]?.id ?? '',
    [templates]
  );

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .min(1, t('job.validation.titleRequired'))
          .max(150, t('job.validation.titleMax')),
        description: z.string().max(10000),
        departmentId: z.string(),
        positionId: z.string(),
        employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']),
        location: z.string().max(150),
        headcount: z.coerce
          .number()
          .int()
          .min(1, t('job.validation.headcountMin'))
          .max(1000),
        pipelineTemplateId: z.string().min(1, t('job.validation.pipelineRequired')),
        status: z.enum(['DRAFT', 'OPEN']),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      departmentId: NONE_VALUE,
      positionId: NONE_VALUE,
      employmentType: 'FULL_TIME',
      location: '',
      headcount: 1,
      pipelineTemplateId: defaultTemplateId,
      status: 'DRAFT',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        title: job?.title ?? '',
        description: job?.description ?? '',
        departmentId: job?.departmentId ?? NONE_VALUE,
        positionId: job?.positionId ?? NONE_VALUE,
        employmentType: job?.employmentType ?? 'FULL_TIME',
        location: job?.location ?? '',
        headcount: job?.headcount ?? 1,
        pipelineTemplateId: defaultTemplateId,
        status: 'DRAFT',
      });
    }
  }, [open, job, defaultTemplateId, reset]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[540px] sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('job.form.editTitle') : t('job.form.createTitle')}</SheetTitle>
          <SheetDescription>
            {isEditing ? t('job.form.editDescription') : t('job.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="job-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">
              {t('job.form.titleLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="title"
              placeholder={t('job.form.titlePlaceholder')}
              error={!!errors.title}
              {...register('title')}
            />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">{t('job.form.departmentLabel')}</Label>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="departmentId">
                      <SelectValue placeholder={t('job.form.departmentPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>{t('job.form.noneOption')}</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="positionId">{t('job.form.positionLabel')}</Label>
              <Controller
                name="positionId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="positionId">
                      <SelectValue placeholder={t('job.form.positionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>{t('job.form.noneOption')}</SelectItem>
                      {positions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="employmentType">{t('job.form.employmentTypeLabel')}</Label>
              <Controller
                name="employmentType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="employmentType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`job.employmentType.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="headcount">{t('job.form.headcountLabel')}</Label>
              <Input
                id="headcount"
                type="number"
                min={1}
                error={!!errors.headcount}
                {...register('headcount')}
              />
              {errors.headcount && (
                <p className="text-xs text-danger">{errors.headcount.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">{t('job.form.locationLabel')}</Label>
            <Input
              id="location"
              placeholder={t('job.form.locationPlaceholder')}
              {...register('location')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{t('job.form.descriptionLabel')}</Label>
            <textarea
              id="description"
              rows={4}
              placeholder={t('job.form.descriptionPlaceholder')}
              className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
              {...register('description')}
            />
          </div>

          {!isEditing && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pipelineTemplateId">
                  {t('job.form.pipelineLabel')} <span className="text-danger">*</span>
                </Label>
                <Controller
                  name="pipelineTemplateId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="pipelineTemplateId">
                        <SelectValue placeholder={t('job.form.pipelinePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {tpl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.pipelineTemplateId && (
                  <p className="text-xs text-danger">{errors.pipelineTemplateId.message}</p>
                )}
                <p className="text-xs text-text-muted">{t('job.form.pipelineHint')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">{t('job.form.statusLabel')}</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">{t('job.status.DRAFT')}</SelectItem>
                        <SelectItem value="OPEN">{t('job.status.OPEN')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </>
          )}
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="job-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('job.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
