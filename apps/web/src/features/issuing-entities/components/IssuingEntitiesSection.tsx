import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Building2, EyeOff, Pencil, Plus } from 'lucide-react';
import type { IssuingEntityDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
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
import { IssuingEntityLogo } from './IssuingEntityLogo';
import {
  IssuingEntityFormSheet,
  type IssuingEntityFormData,
} from './IssuingEntityFormSheet';
import {
  useCreateIssuingEntity,
  useDeleteIssuingEntity,
  useIssuingEntities,
  useUpdateIssuingEntity,
} from '../hooks/useIssuingEntities';

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
            <Building2 className="w-[18px] h-[18px] text-text-secondary" />
            {title}
          </h3>
          <p className="text-xs text-text-muted mt-1 m-0">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

interface IssuingEntitiesSectionProps {
  canEdit: boolean;
}

export function IssuingEntitiesSection({ canEdit }: IssuingEntitiesSectionProps) {
  const { t } = useTranslation('settings');
  const { data, isLoading, isError } = useIssuingEntities(false);
  const createMutation = useCreateIssuingEntity();
  const updateMutation = useUpdateIssuingEntity();
  const deleteMutation = useDeleteIssuingEntity();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<IssuingEntityDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssuingEntityDto | null>(null);

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(entity: IssuingEntityDto) {
    setEditing(entity);
    setSheetOpen(true);
  }

  function handleSubmit(form: IssuingEntityFormData) {
    const payload = {
      name: form.name.trim(),
      address: form.address?.trim() || null,
      taxCode: form.taxCode?.trim() || null,
      phone: form.phone?.trim() || null,
      isDefault: !!form.isDefault,
    };

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: (updated) => {
            toast.success(t('issuingEntities.toast.updated'));
            // Keep the sheet open so the user can manage the logo right away.
            setEditing(updated);
          },
          onError: () => toast.error(t('issuingEntities.toast.error')),
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          toast.success(t('issuingEntities.toast.created'));
          // Switch to edit so the logo uploader (which needs an id) is available.
          setEditing(created);
        },
        onError: () => toast.error(t('issuingEntities.toast.error')),
      });
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('issuingEntities.toast.hidden'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('issuingEntities.toast.error'));
        setDeleteTarget(null);
      },
    });
  }

  const entities = data ?? [];

  return (
    <SectionCard
      title={t('issuingEntities.title')}
      description={t('issuingEntities.description')}
      action={
        canEdit ? (
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />
            {t('issuingEntities.add')}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <Skeleton className="size-12 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-3.5 w-1/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium m-0">{t('issuingEntities.errorState.title')}</p>
          <p className="text-text-muted text-sm mt-1 m-0">
            {t('issuingEntities.errorState.description')}
          </p>
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <Building2 className="size-5 text-text-muted" />
          </div>
          <p className="text-text-primary font-medium m-0">{t('issuingEntities.empty.title')}</p>
          <p className="text-text-muted text-sm mt-1 mb-4 max-w-xs m-0">
            {t('issuingEntities.empty.description')}
          </p>
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              {t('issuingEntities.add')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3 m-0 p-0 list-none">
          {entities.map((entity) => (
            <li
              key={entity.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <IssuingEntityLogo
                entityId={entity.id}
                cacheKey={entity.updatedAt}
                hasLogo={!!entity.logoUrl}
                alt={t('issuingEntities.logo.alt', { name: entity.name })}
                className="size-12"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {entity.name}
                  </span>
                  {entity.isDefault && (
                    <Badge variant="secondary" className="text-[11px]">
                      {t('issuingEntities.defaultBadge')}
                    </Badge>
                  )}
                  {!entity.active && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <EyeOff className="size-3" />
                      {t('issuingEntities.hiddenBadge')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5 m-0 truncate">
                  {entity.taxCode
                    ? `${t('issuingEntities.fields.taxCode')}: ${entity.taxCode}`
                    : (entity.address ?? t('issuingEntities.noTaxCode'))}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t('issuingEntities.actions.edit', { name: entity.name })}
                    onClick={() => openEdit(entity)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {entity.active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-danger hover:text-danger"
                      aria-label={t('issuingEntities.actions.hide', { name: entity.name })}
                      onClick={() => setDeleteTarget(entity)}
                    >
                      <EyeOff className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <IssuingEntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entity={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('issuingEntities.hide.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('issuingEntities.hide.description', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('issuingEntities.form.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleteMutation.isPending
                ? t('issuingEntities.hide.hiding')
                : t('issuingEntities.hide.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
