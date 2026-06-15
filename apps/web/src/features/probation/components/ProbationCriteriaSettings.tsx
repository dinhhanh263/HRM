import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { ProbationCriteriaDto, ProbationRubricLevel } from '@hrm/shared';
import { getApiErrorCode } from '@/lib/api-error';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import {
  useProbationCriteria,
  useCreateProbationCriteria,
  useUpdateProbationCriteria,
  useDeleteProbationCriteria,
} from '../hooks/useProbation';

// SPEC-031: rubric trong form = 5 hàng cố định ứng điểm 1..5. Bỏ trống toàn bộ = không
// có rubric (gửi null); nếu có bất kỳ nội dung nào thì mỗi mức bắt buộc có nhãn.
const rubricRowSchema = z.object({
  level: z.string().max(120),
  definition: z.string().max(2000),
  observable: z.string().max(2000),
});

const schema = z
  .object({
    name: z.string().min(1).max(120),
    order: z.coerce.number().int().min(0),
    isActive: z.boolean(),
    group: z.enum(['PERFORMANCE', 'VALUES']),
    rubric: z.array(rubricRowSchema).length(5),
  })
  .superRefine((data, ctx) => {
    const hasAny = data.rubric.some(
      (r) => r.level.trim() || r.definition.trim() || r.observable.trim()
    );
    if (!hasAny) return;
    data.rubric.forEach((r, i) => {
      if (!r.level.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rubric', i, 'level'],
          message: 'level_required',
        });
      }
    });
  });

type FormData = z.infer<typeof schema>;

const EMPTY_RUBRIC_ROWS = Array.from({ length: 5 }, () => ({
  level: '',
  definition: '',
  observable: '',
}));

const DEFAULTS: FormData = {
  name: '',
  order: 0,
  isActive: true,
  group: 'PERFORMANCE',
  rubric: EMPTY_RUBRIC_ROWS,
};

function toRubricRows(rubric: ProbationRubricLevel[] | null): FormData['rubric'] {
  if (!rubric || rubric.length === 0) return EMPTY_RUBRIC_ROWS.map((r) => ({ ...r }));
  return Array.from({ length: 5 }, (_, i) => {
    const lvl = rubric.find((r) => r.score === i + 1);
    return {
      level: lvl?.level ?? '',
      definition: lvl?.definition ?? '',
      observable: lvl?.observable ?? '',
    };
  });
}

function toRubricPayload(rows: FormData['rubric']): ProbationRubricLevel[] | null {
  const hasAny = rows.some((r) => r.level.trim() || r.definition.trim() || r.observable.trim());
  if (!hasAny) return null;
  return rows.map((r, i) => ({
    score: i + 1,
    level: r.level.trim(),
    ...(r.definition.trim() ? { definition: r.definition.trim() } : {}),
    ...(r.observable.trim() ? { observable: r.observable.trim() } : {}),
  }));
}

export function ProbationCriteriaSettings() {
  const { t } = useTranslation('probation');
  const { data: criteria, isLoading } = useProbationCriteria();
  const createMutation = useCreateProbationCriteria();
  const [editing, setEditing] = useState<ProbationCriteriaDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProbationCriteriaDto | null>(null);

  const updateMutation = useUpdateProbationCriteria(editing?.id ?? '');
  const deleteMutation = useDeleteProbationCriteria();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  function openCreate() {
    setEditing(null);
    reset({
      ...DEFAULTS,
      rubric: EMPTY_RUBRIC_ROWS.map((r) => ({ ...r })),
      order: criteria?.length ?? 0,
    });
    setFormOpen(true);
  }

  function openEdit(c: ProbationCriteriaDto) {
    setEditing(c);
    reset({
      name: c.name,
      order: c.order,
      isActive: c.isActive,
      group: c.group,
      rubric: toRubricRows(c.rubric),
    });
    setFormOpen(true);
  }

  function submit(data: FormData) {
    const mutation = editing ? updateMutation : createMutation;
    mutation.mutate(
      {
        name: data.name,
        order: data.order,
        isActive: data.isActive,
        group: data.group,
        rubric: toRubricPayload(data.rubric),
      },
      {
        onSuccess: () => {
          toast.success(t('criteria.toast.saved'));
          setFormOpen(false);
        },
        onError: () =>
          toast.error(t('criteria.toast.saveError'), { description: t('toast.tryAgain') }),
      }
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('criteria.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: (error) => {
        // The server blocks deleting a criteria already used in a review — surface
        // the "deactivate instead" guidance rather than a generic failure.
        const code = getApiErrorCode(error);
        const description =
          code === 'PROBATION_CRITERIA_IN_USE'
            ? t('criteria.toast.inUse')
            : t('toast.tryAgain');
        toast.error(t('criteria.toast.deleteError'), { description });
        setDeleteTarget(null);
      },
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('criteria.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('criteria.subtitle')}</p>
        </div>
        <Can permission="probation:configure">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t('criteria.add')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4">
              <Skeleton className="h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : !criteria || criteria.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <GripVertical className="size-5 text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">{t('criteria.empty.title')}</p>
          <p className="text-xs text-text-muted max-w-xs mb-4">{t('criteria.empty.description')}</p>
          <Can permission="probation:configure">
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" />
              {t('criteria.add')}
            </Button>
          </Can>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="w-16 text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">
                {t('criteria.columns.order')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('criteria.columns.name')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('criteria.columns.group')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('criteria.columns.status')}
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {criteria.map((c) => (
              <TableRow key={c.id} className="group h-12 hover:bg-background">
                <TableCell className="text-right text-sm tabular-nums text-text-secondary">
                  {c.order}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium text-text-primary">{c.name}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-text-secondary">
                    {t(`criteria.groups.${c.group}`)}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={c.isActive ? 'text-xs text-green-700' : 'text-xs text-text-muted'}>
                    {c.isActive ? t('criteria.active') : t('criteria.inactive')}
                  </span>
                </TableCell>
                <TableCell>
                  <Can permission="probation:configure">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('actions.edit', { ns: 'common' })}
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-danger"
                        aria-label={t('actions.delete', { ns: 'common' })}
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('criteria.form.editTitle') : t('criteria.form.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pc-name" className="text-sm font-medium">
                {t('criteria.form.name')} <span className="text-danger">*</span>
              </Label>
              <Input id="pc-name" className="h-9 text-sm" {...register('name')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pc-order" className="text-sm font-medium">
                  {t('criteria.form.order')}
                </Label>
                <Input
                  id="pc-order"
                  type="number"
                  min={0}
                  className="h-9 text-sm"
                  {...register('order')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-group" className="text-sm font-medium">
                  {t('criteria.form.group')}
                </Label>
                <Select
                  value={watch('group')}
                  onValueChange={(v) => setValue('group', v as FormData['group'])}
                >
                  <SelectTrigger id="pc-group" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERFORMANCE">
                      {t('scorecard.groups.PERFORMANCE')}
                    </SelectItem>
                    <SelectItem value="VALUES">{t('scorecard.groups.VALUES')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-primary"
                checked={watch('isActive')}
                onChange={(e) => setValue('isActive', e.target.checked)}
              />
              <span className="text-sm text-text-primary">{t('criteria.form.isActive')}</span>
            </label>

            {/* SPEC-031: rubric BARS — 5 hàng cố định ứng điểm 1..5. */}
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">{t('criteria.form.rubric')}</Label>
                <p className="text-xs text-text-muted mt-0.5">{t('criteria.form.rubricHint')}</p>
              </div>
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="grid grid-cols-[1.75rem_1fr] items-start gap-2">
                    <span className="mt-1.5 text-center text-sm font-semibold tabular-nums text-text-secondary">
                      {i + 1}
                    </span>
                    <div className="space-y-1.5">
                      <Input
                        className="h-8 text-sm"
                        placeholder={t('criteria.form.levelPlaceholder', { score: i + 1 })}
                        aria-invalid={!!errors.rubric?.[i]?.level}
                        {...register(`rubric.${i}.level` as const)}
                      />
                      {errors.rubric?.[i]?.level && (
                        <p className="text-xs text-danger">{t('criteria.form.levelRequired')}</p>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          className="h-8 text-sm"
                          placeholder={t('criteria.form.definitionPlaceholder')}
                          {...register(`rubric.${i}.definition` as const)}
                        />
                        <Input
                          className="h-8 text-sm"
                          placeholder={t('criteria.form.observablePlaceholder')}
                          {...register(`rubric.${i}.observable` as const)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                {t('actions.cancel', { ns: 'common' })}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {t('actions.save', { ns: 'common' })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('criteria.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('criteria.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={deleteMutation.isPending}
            >
              {t('criteria.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
