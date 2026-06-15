import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetCategoryDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { AssetCategoryTable } from './AssetCategoryTable';
import { AssetCategoryFormSheet, type AssetCategoryFormData } from './AssetCategoryFormSheet';
import {
  useAssetCategories,
  useCreateAssetCategory,
  useUpdateAssetCategory,
  useDeleteAssetCategory,
} from '../hooks/useAssetCategories';
import { Plus, Search, X, AlertTriangle } from 'lucide-react';

export function AssetCategorySettings() {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const [searchInput, setSearchInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AssetCategoryDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetCategoryDto | null>(null);

  const { data, isLoading, error } = useAssetCategories();
  const createMutation = useCreateAssetCategory();
  const updateMutation = useUpdateAssetCategory(editing?.id ?? '');
  const deleteMutation = useDeleteAssetCategory();

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = searchInput.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [data, searchInput]);

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(category: AssetCategoryDto) {
    setEditing(category);
    setSheetOpen(true);
  }

  function handleSubmit(formData: AssetCategoryFormData) {
    const description = formData.description?.trim() ? formData.description : null;

    if (editing) {
      updateMutation.mutate(
        { name: formData.name, description },
        {
          onSuccess: () => {
            toast.success(t('category.toast.updated'));
            setSheetOpen(false);
          },
          onError: () =>
            toast.error(t('category.toast.updateError'), {
              description: t('category.toast.updateErrorDescription'),
            }),
        },
      );
    } else {
      createMutation.mutate(
        { name: formData.name, code: formData.code, description },
        {
          onSuccess: () => {
            toast.success(t('category.toast.created'));
            setSheetOpen(false);
          },
          onError: () =>
            toast.error(t('category.toast.createError'), {
              description: t('category.toast.createErrorDescription'),
            }),
        },
      );
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('category.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('category.toast.deleteError'), {
          description: t('category.toast.deleteErrorDescription'),
        });
        setDeleteTarget(null);
      },
    });
  }

  const inUse = (deleteTarget?.assetCount ?? 0) > 0;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
          <Input
            placeholder={t('category.list.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`pl-8 h-8 w-56 text-xs ${searchInput ? 'pr-7' : ''}`}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              aria-label={tc('actions.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <p className="text-xs text-text-muted shrink-0">
              <span className="font-medium text-text-primary">{data.length}</span>{' '}
              {t('category.list.count')}
            </p>
          )}
          <Can permission="assets:configure">
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              {t('category.form.create')}
            </Button>
          </Can>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-3.5 w-1/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="size-7 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{t('category.errorState.title')}</p>
          <p className="text-text-muted text-sm mt-1">{t('category.errorState.description')}</p>
        </div>
      ) : (
        <AssetCategoryTable
          categories={filtered}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      {/* Create / Edit Sheet */}
      <AssetCategoryFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        category={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('category.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {inUse
                ? t('category.delete.inUse', {
                    name: deleteTarget?.name,
                    count: deleteTarget?.assetCount ?? 0,
                  })
                : t('category.delete.description', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={inUse || deleteMutation.isPending}
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
