import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Pencil, Plus, Star, Trash2, AlertTriangle } from 'lucide-react';
import type { PipelineTemplateDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import {
  usePipelineTemplates,
  useCreatePipelineTemplate,
  useUpdatePipelineTemplate,
  useSetDefaultPipelineTemplate,
  useDeletePipelineTemplate,
} from '../hooks/usePipelineTemplates';
import {
  PipelineTemplateFormSheet,
  type PipelineTemplateFormData,
} from './PipelineTemplateFormSheet';

function withOrder(stages: { name: string; type: PipelineTemplateFormData['stages'][number]['type'] }[]) {
  return stages.map((s, index) => ({ name: s.name, type: s.type, order: index }));
}

export function PipelineTemplateSettings() {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canManage = can('recruitment:job_update');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineTemplateDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PipelineTemplateDto | null>(null);

  const { data, isLoading, error } = usePipelineTemplates();
  const createMutation = useCreatePipelineTemplate();
  const updateMutation = useUpdatePipelineTemplate(editing?.id ?? '');
  const deleteMutation = useDeletePipelineTemplate();
  const setDefaultMutation = useSetDefaultPipelineTemplate();

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(template: PipelineTemplateDto) {
    setEditing(template);
    setSheetOpen(true);
  }

  function handleSubmit(formData: PipelineTemplateFormData) {
    const payload = {
      name: formData.name,
      isDefault: formData.isDefault,
      stages: withOrder(formData.stages),
    };

    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('pipeline.toast.updated'));
          setSheetOpen(false);
        },
        onError: () => toast.error(t('pipeline.toast.error')),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('pipeline.toast.created'));
          setSheetOpen(false);
        },
        onError: () => toast.error(t('pipeline.toast.error')),
      });
    }
  }

  function handleSetDefault(template: PipelineTemplateDto) {
    if (template.isDefault) return;
    setDefaultMutation.mutate(template.id, {
      onError: () => toast.error(t('pipeline.toast.error')),
      onSuccess: () => toast.success(t('pipeline.toast.defaultSet')),
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('pipeline.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('pipeline.toast.error'));
        setDeleteTarget(null);
      },
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t('pipeline.sectionTitle')}
          </h2>
          <p className="text-sm text-text-secondary mt-0.5 max-w-xl">
            {t('pipeline.sectionSubtitle')}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus size={14} className="mr-1.5" />
            {t('pipeline.create')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <Skeleton className="h-4 w-1/2 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-16 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-border bg-surface">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{tc('states.error')}</p>
          <p className="text-text-muted text-sm mt-1">{t('pipeline.loadError')}</p>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <GitBranch size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('pipeline.empty.title')}</h3>
          <p className="text-sm text-text-secondary max-w-xs mb-4">
            {t('pipeline.empty.description')}
          </p>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} className="mr-1.5" />
              {t('pipeline.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((template) => (
            <div
              key={template.id}
              className="group rounded-lg border border-border bg-surface p-4 transition-all duration-150 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">{template.name}</h3>
                  {template.isDefault && (
                    <Badge
                      variant="outline"
                      className="text-xs font-medium bg-primary/10 text-primary border-primary/20 shrink-0"
                    >
                      {t('pipeline.defaultBadge')}
                    </Badge>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('pipeline.setDefault')}
                        title={t('pipeline.setDefault')}
                        onClick={() => handleSetDefault(template)}
                      >
                        <Star size={14} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={t('pipeline.edit')}
                      onClick={() => openEdit(template)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-text-muted hover:text-danger"
                      aria-label={t('pipeline.delete')}
                      disabled={template.isDefault}
                      onClick={() => setDeleteTarget(template)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>

              <p className="text-xs text-text-muted mt-1">
                {t('pipeline.stagesCount', { count: template.stages.length })}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {template.stages.map((stage) => (
                  <span
                    key={stage.id}
                    className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {stage.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PipelineTemplateFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        template={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pipeline.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pipeline.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleteMutation.isPending ? tc('states.deleting') : tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
