import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { LeaveTypeDto } from '@hrm/shared';
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
import { Plus, Pencil, Trash2, Check, Minus } from 'lucide-react';
import {
  useLeaveTypes,
  useCreateLeaveType,
  useUpdateLeaveType,
  useDeleteLeaveType,
} from '../hooks/useLeave';
import { formatDays } from '../utils';

const schema = z.object({
  name: z.string().min(1),
  code: z.string().regex(/^[A-Za-z0-9_]+$/),
  defaultDays: z.coerce.number().min(0).max(365),
  colorHex: z.string().regex(/^#([0-9A-Fa-f]{6})$/),
  paid: z.boolean(),
  requiresAttachment: z.boolean(),
  active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const DEFAULTS: FormData = {
  name: '',
  code: '',
  defaultDays: 0,
  colorHex: '#4A9EBF',
  paid: true,
  requiresAttachment: false,
  active: true,
};

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <Check className="size-4 text-green-600" />
  ) : (
    <Minus className="size-4 text-text-muted" />
  );
}

export function LeaveTypeSettings() {
  const { t } = useTranslation('leave');
  const { data: types, isLoading } = useLeaveTypes();
  const createMutation = useCreateLeaveType();
  const [editing, setEditing] = useState<LeaveTypeDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeaveTypeDto | null>(null);

  // Update mutation is created per-id when editing; fall back to a throwaway id.
  const updateMutation = useUpdateLeaveType(editing?.id ?? '');
  const deleteMutation = useDeleteLeaveType();

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  function openCreate() {
    setEditing(null);
    reset(DEFAULTS);
    setFormOpen(true);
  }

  function openEdit(type: LeaveTypeDto) {
    setEditing(type);
    reset({
      name: type.name,
      code: type.code,
      defaultDays: type.defaultDays,
      colorHex: type.colorHex || '#4A9EBF',
      paid: type.paid,
      requiresAttachment: type.requiresAttachment,
      active: type.active,
    });
    setFormOpen(true);
  }

  function submit(data: FormData) {
    if (editing) {
      // code is immutable after creation
      const { code: _code, ...rest } = data;
      updateMutation.mutate(rest, {
        onSuccess: () => {
          toast.success(t('toast.typeSaved'));
          setFormOpen(false);
        },
        onError: () => toast.error(t('toast.typeSaveError'), { description: t('toast.tryAgain') }),
      });
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast.success(t('toast.typeSaved'));
          setFormOpen(false);
        },
        onError: () => toast.error(t('toast.typeSaveError'), { description: t('toast.tryAgain') }),
      });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toast.typeDeleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('toast.typeDeleteError'), { description: t('toast.tryAgain') });
        setDeleteTarget(null);
      },
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <p className="text-sm font-medium text-text-primary">{t('settings.title')}</p>
        <Can permission="leave:configure">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t('settings.addType')}
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
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('settings.columns.name')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('settings.columns.code')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">
                {t('settings.columns.defaultDays')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('settings.columns.paid')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('settings.columns.attachment')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('settings.columns.active')}
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {types?.map((type) => (
              <TableRow key={type.id} className="group h-12 hover:bg-background">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: type.colorHex || '#4A9EBF' }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-text-primary">{type.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-mono text-text-secondary">{type.code}</span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-text-primary">
                  {formatDays(type.defaultDays)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <BoolCell value={type.paid} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <BoolCell value={type.requiresAttachment} />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={
                      type.active
                        ? 'text-xs text-green-700'
                        : 'text-xs text-text-muted'
                    }
                  >
                    {type.active ? t('settings.active') : t('settings.inactive')}
                  </span>
                </TableCell>
                <TableCell>
                  <Can permission="leave:configure">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('actions.save', { ns: 'common' })}
                        onClick={() => openEdit(type)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-danger"
                        aria-label={t('actions.delete', { ns: 'common' })}
                        onClick={() => setDeleteTarget(type)}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('settings.form.editTitle') : t('settings.form.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name" className="text-sm font-medium">
                {t('settings.form.name')} <span className="text-danger">*</span>
              </Label>
              <Input id="lt-name" className="h-9 text-sm" {...register('name')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lt-code" className="text-sm font-medium">
                  {t('settings.form.code')} <span className="text-danger">*</span>
                </Label>
                <Input
                  id="lt-code"
                  className="h-9 text-sm font-mono"
                  disabled={!!editing}
                  {...register('code')}
                />
                {editing && (
                  <p className="text-[11px] text-text-muted">{t('settings.form.codeHint')}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lt-days" className="text-sm font-medium">
                  {t('settings.form.defaultDays')}
                </Label>
                <Input
                  id="lt-days"
                  type="number"
                  min={0}
                  max={365}
                  className="h-9 text-sm"
                  {...register('defaultDays')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lt-color" className="text-sm font-medium">
                {t('settings.form.colorHex')}
              </Label>
              <div className="flex items-center gap-2">
                <input
                  id="lt-color"
                  type="color"
                  className="h-9 w-12 rounded-md border border-border bg-surface cursor-pointer"
                  value={watch('colorHex')}
                  onChange={(e) => setValue('colorHex', e.target.value)}
                />
                <Input
                  className="h-9 text-sm font-mono flex-1"
                  {...register('colorHex')}
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={watch('paid')}
                  onChange={(e) => setValue('paid', e.target.checked)}
                />
                <span className="text-sm text-text-primary">{t('settings.form.paid')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={watch('requiresAttachment')}
                  onChange={(e) => setValue('requiresAttachment', e.target.checked)}
                />
                <span className="text-sm text-text-primary">
                  {t('settings.form.requiresAttachment')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={watch('active')}
                  onChange={(e) => setValue('active', e.target.checked)}
                />
                <span className="text-sm text-text-primary">{t('settings.form.active')}</span>
              </label>
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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={deleteMutation.isPending}
            >
              {t('settings.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
