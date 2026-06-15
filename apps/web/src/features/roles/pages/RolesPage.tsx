import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoleListItemDto } from '@hrm/shared';
import {
  Plus,
  ShieldCheck,
  Lock,
  Users,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { usePermission } from '@/hooks/usePermission';
import { PermissionMatrix } from '../components/PermissionMatrix';
import { RoleFormSheet, type RoleFormData } from '../components/RoleFormSheet';
import {
  useRoles,
  useRole,
  usePermissionsCatalog,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from '../hooks/useRoles';

export function RolesPage() {
  const { t } = useTranslation('role');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();

  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRoles();
  const { data: catalog = [] } = usePermissionsCatalog();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleListItemDto | null>(null);

  // Default-select the first role once the list loads.
  useEffect(() => {
    if (!selectedId && roles && roles.length > 0) {
      setSelectedId(roles[0].id);
    }
  }, [roles, selectedId]);

  const { data: detail } = useRole(selectedId ?? undefined);
  const selectedListItem = roles?.find((r) => r.id === selectedId) ?? null;

  // Local editable state for a custom role, synced from the loaded detail.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (detail) {
      setName(detail.name);
      setDescription(detail.description ?? '');
      setSelected(new Set(detail.permissions));
    }
  }, [detail]);

  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole(selectedId ?? '');
  const deleteMutation = useDeleteRole();

  const isSystem = detail?.isSystem ?? selectedListItem?.isSystem ?? false;
  // System roles: their permission set is configurable, but name/description
  // are locked (they back the catalog + i18n labels) and they can't be deleted.
  const canEditPermissions = can('roles:update');
  const canEditMeta = !isSystem && canEditPermissions;

  // System roles are seeded with Vietnamese names/descriptions in the DB, so we
  // show a localized label keyed by the role's stable `key`. Edit-state (`name`/
  // `description`) stays bound to the DB value so a permission-only save never
  // sends a changed name (the backend rejects renaming a system role). Custom
  // roles keep whatever the user typed.
  const roleDisplayName = (role: { isSystem: boolean; key: string; name: string }) =>
    role.isSystem ? t(`system.names.${role.key}`, { defaultValue: role.name }) : role.name;
  const roleKey = detail?.key ?? selectedListItem?.key ?? '';
  const rawName = detail?.name ?? selectedListItem?.name ?? '';
  const systemName = t(`system.names.${roleKey}`, { defaultValue: rawName });
  const systemDescription = t(`system.descriptions.${roleKey}`, {
    defaultValue: detail?.description ?? '',
  });

  const isDirty = useMemo(() => {
    if (!detail) return false;
    if (name.trim() !== detail.name) return true;
    if ((description.trim() || '') !== (detail.description ?? '')) return true;
    const current = new Set(detail.permissions);
    if (current.size !== selected.size) return true;
    for (const k of selected) if (!current.has(k)) return true;
    return false;
  }, [detail, name, description, selected]);

  function handleCreate(data: RoleFormData) {
    createMutation.mutate(
      {
        name: data.name,
        description: data.description.trim() ? data.description.trim() : null,
        permissions: data.permissions,
      },
      {
        onSuccess: (role) => {
          toast.success(t('toast.created'));
          setSheetOpen(false);
          setSelectedId(role.id);
        },
        onError: () =>
          toast.error(t('toast.createError'), { description: t('toast.createErrorDescription') }),
      }
    );
  }

  function handleSave() {
    if (!selectedId || !canEditPermissions) return;
    updateMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        permissions: Array.from(selected),
      },
      {
        onSuccess: () => toast.success(t('toast.updated')),
        onError: () =>
          toast.error(t('toast.updateError'), { description: t('toast.updateErrorDescription') }),
      }
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toast.deleted'));
        if (selectedId === deleteTarget.id) setSelectedId(null);
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('toast.deleteError'), { description: t('toast.deleteErrorDescription') });
        setDeleteTarget(null);
      },
    });
  }

  const deleteHasUsers = (deleteTarget?.userCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('list.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('list.subtitle')}</p>
        </div>
        {can('roles:create') && (
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('form.create')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Role list */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-background">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('list.rolesHeading')}
            </p>
          </div>

          {rolesLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="size-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3 rounded" />
                    <Skeleton className="h-3 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : rolesError ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="size-10 rounded-full bg-danger-light flex items-center justify-center mb-2">
                <AlertTriangle className="size-5 text-danger" />
              </div>
              <p className="text-sm text-text-primary font-medium">{t('errorState.title')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {roles?.map((role) => {
                const active = role.id === selectedId;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(role.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
                        active ? 'bg-primary-light/60' : 'hover:bg-surface-alt'
                      )}
                    >
                      <div
                        className={cn(
                          'size-8 rounded-lg flex items-center justify-center shrink-0',
                          active ? 'bg-primary text-primary-foreground' : 'bg-surface-alt text-text-muted'
                        )}
                      >
                        <ShieldCheck size={16} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-text-primary truncate">
                            {roleDisplayName(role)}
                          </span>
                          {role.isSystem && (
                            <Lock size={11} className="text-text-muted shrink-0" />
                          )}
                        </div>
                        <span className="text-xs text-text-muted inline-flex items-center gap-1 tabular-nums">
                          <Users size={11} />
                          {t('list.userCount', { count: role.userCount })}
                          <span className="mx-1">·</span>
                          {t('list.permissionCount', { count: role.permissionCount })}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail / editor */}
        <div className="bg-surface rounded-xl border border-border shadow-sm">
          {!selectedListItem ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="size-12 rounded-full bg-surface-alt flex items-center justify-center mb-3">
                <ShieldCheck className="size-6 text-text-muted" />
              </div>
              <p className="text-sm text-text-primary font-medium">{t('detail.emptyTitle')}</p>
              <p className="text-xs text-text-muted mt-1">{t('detail.emptyDescription')}</p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Detail header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-text-primary m-0 truncate">
                      {isSystem ? systemName : rawName}
                    </h2>
                    {isSystem && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock size={11} />
                        {t('detail.systemBadge')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    {detail?.key ?? selectedListItem.key}
                  </p>
                </div>
                {!isSystem && can('roles:delete') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => setDeleteTarget(selectedListItem)}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    {tc('actions.delete')}
                  </Button>
                )}
              </div>

              {isSystem && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-alt/50 px-3 py-2.5">
                  <Lock size={14} className="text-text-muted mt-0.5 shrink-0" />
                  <p className="text-xs text-text-secondary m-0">{t('detail.systemNote')}</p>
                </div>
              )}

              {/* Name + description (editable for custom roles) */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="detail-name">{t('form.nameLabel')}</Label>
                  <Input
                    id="detail-name"
                    value={isSystem ? systemName : name}
                    disabled={!canEditMeta}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="detail-description">{t('form.descriptionLabel')}</Label>
                  <Textarea
                    id="detail-description"
                    value={isSystem ? systemDescription : description}
                    disabled={!canEditMeta}
                    placeholder={canEditMeta ? t('form.descriptionPlaceholder') : undefined}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Permission matrix */}
              <div className="space-y-1.5">
                <Label>{t('form.permissionsLabel')}</Label>
                <PermissionMatrix
                  catalog={catalog}
                  selected={selected}
                  onChange={canEditPermissions ? setSelected : undefined}
                  readOnly={!canEditPermissions}
                />
              </div>

              {/* Save bar */}
              {canEditPermissions && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    onClick={handleSave}
                    disabled={!isDirty || updateMutation.isPending}
                  >
                    {updateMutation.isPending ? tc('states.saving') : tc('actions.saveChanges')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create sheet */}
      <RoleFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        catalog={catalog}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteHasUsers
                ? t('delete.hasUsers', {
                    name: deleteTarget?.name,
                    count: deleteTarget?.userCount ?? 0,
                  })
                : t('delete.description', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteHasUsers || deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleteMutation.isPending ? tc('states.deleting') : tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
