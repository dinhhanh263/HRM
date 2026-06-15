import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { PipelineTemplateDto, StageType } from '@hrm/shared';
import { StageType as StageTypeEnum } from '@hrm/shared';
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
import { cn } from '@/lib/utils';

const STAGE_TYPES = Object.values(StageTypeEnum);

export interface PipelineTemplateFormData {
  name: string;
  isDefault: boolean;
  stages: { name: string; type: StageType }[];
}

interface PipelineTemplateFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: PipelineTemplateDto | null;
  onSubmit: (data: PipelineTemplateFormData) => void;
  isLoading?: boolean;
}

export function PipelineTemplateFormSheet({
  open,
  onOpenChange,
  template,
  onSubmit,
  isLoading,
}: PipelineTemplateFormSheetProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const isEditing = !!template;

  const defaultStages = useMemo(
    () => [
      { name: t('pipeline.defaultStages.sourced'), type: StageTypeEnum.SOURCED },
      { name: t('pipeline.defaultStages.screen'), type: StageTypeEnum.SCREEN },
      { name: t('pipeline.defaultStages.interview'), type: StageTypeEnum.INTERVIEW },
      { name: t('pipeline.defaultStages.hired'), type: StageTypeEnum.HIRED },
      { name: t('pipeline.defaultStages.rejected'), type: StageTypeEnum.REJECTED },
    ],
    [t]
  );

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t('pipeline.validation.nameRequired'))
          .max(100, t('pipeline.validation.nameMax')),
        isDefault: z.boolean(),
        stages: z
          .array(
            z.object({
              name: z.string().min(1, t('pipeline.validation.stageNameRequired')),
              type: z.enum(STAGE_TYPES as [StageType, ...StageType[]]),
            })
          )
          .min(2, t('pipeline.validation.minStages'))
          .superRefine((stages, ctx) => {
            if (!stages.some((s) => s.type === StageTypeEnum.HIRED)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('pipeline.validation.needHired') });
            }
            if (!stages.some((s) => s.type === StageTypeEnum.REJECTED)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t('pipeline.validation.needRejected'),
              });
            }
          }),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<PipelineTemplateFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', isDefault: false, stages: defaultStages },
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'stages' });

  useEffect(() => {
    if (open) {
      reset({
        name: template?.name ?? '',
        isDefault: template?.isDefault ?? false,
        stages: template
          ? template.stages.map((s) => ({ name: s.name, type: s.type }))
          : defaultStages,
      });
    }
  }, [open, template, reset, defaultStages]);

  const stagesError =
    typeof errors.stages?.message === 'string' ? errors.stages.message : undefined;
  const stagesRootError =
    typeof errors.stages?.root?.message === 'string' ? errors.stages.root.message : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[540px] sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? t('pipeline.form.editTitle') : t('pipeline.form.createTitle')}
          </SheetTitle>
          <SheetDescription>
            {isEditing ? t('pipeline.form.editDescription') : t('pipeline.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="pipeline-template-form"
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">
              {t('pipeline.form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="pt-name"
              placeholder={t('pipeline.form.namePlaceholder')}
              error={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pt-default" className="flex items-center gap-2 cursor-pointer">
              <input
                id="pt-default"
                type="checkbox"
                className="size-4 rounded border-border-strong text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                {...register('isDefault')}
              />
              <span>{t('pipeline.form.isDefaultLabel')}</span>
            </Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('pipeline.form.stagesLabel')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => append({ name: '', type: StageTypeEnum.SCREEN })}
              >
                <Plus size={13} />
                {t('pipeline.form.addStage')}
              </Button>
            </div>

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2"
                >
                  <div className="flex flex-col pt-1">
                    <button
                      type="button"
                      aria-label={tc('actions.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={tc('actions.moveDown')}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <Input
                      placeholder={t('pipeline.form.stageNamePlaceholder')}
                      className="h-8 text-xs"
                      error={!!errors.stages?.[index]?.name}
                      {...register(`stages.${index}.name` as const)}
                    />
                    <Controller
                      name={`stages.${index}.type` as const}
                      control={control}
                      render={({ field: typeField }) => (
                        <Select value={typeField.value} onValueChange={typeField.onChange}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {t(`pipeline.stageType.${type}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <button
                    type="button"
                    aria-label={t('pipeline.form.removeStage')}
                    disabled={fields.length <= 2}
                    onClick={() => remove(index)}
                    className={cn(
                      'mt-1 text-text-muted hover:text-danger transition-colors disabled:opacity-30'
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {(stagesError || stagesRootError) && (
              <p className="text-xs text-danger">{stagesError ?? stagesRootError}</p>
            )}
            <p className="text-xs text-text-muted">{t('pipeline.form.hint')}</p>
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="pipeline-template-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('pipeline.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
