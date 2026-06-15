import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AssetDto, AssetListParams, AssetStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { usePermission } from '@/hooks/usePermission';
import { AssetTable } from '../components/AssetTable';
import { MyAssetsView } from '../components/MyAssetsView';
import { AssetFormSheet, toAssetPayload, type AssetFormData } from '../components/AssetFormSheet';
import { AssetImportWizard } from '../components/AssetImportWizard';
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useExportAssets,
} from '../hooks/useAssets';
import { useAssetCategories } from '../hooks/useAssetCategories';
import {
  Plus,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  Download,
  Loader2,
} from 'lucide-react';

const STATUSES: AssetStatus[] = ['AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'];

// Người không có bất kỳ quyền quản lý nào (chỉ assets:view) → view self-service.
// EMPLOYEE rơi vào nhánh này; MANAGER (có assets:export) và HR thấy bảng quản lý.
const MANAGEMENT_PERMISSIONS = [
  'assets:create',
  'assets:update',
  'assets:delete',
  'assets:assign',
  'assets:configure',
  'assets:export',
  'assets:import',
] as const;

export function AssetsPage() {
  const { canAny } = usePermission();
  if (!canAny([...MANAGEMENT_PERMISSIONS])) {
    return <MyAssetsView />;
  }
  return <AssetManagementView />;
}

function AssetManagementView() {
  const navigate = useNavigate();
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const [filters, setFilters] = useState<AssetListParams>({ page: 1, limit: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AssetDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetDto | null>(null);

  const { data, isLoading, error } = useAssets(filters);
  const { data: categories } = useAssetCategories();
  const createMutation = useCreateAsset();
  const updateMutation = useUpdateAsset(editing?.id ?? '');
  const deleteMutation = useDeleteAsset();
  const exportMutation = useExportAssets();

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setFilters({ page: 1, limit: 20 });
    setSearchInput('');
  };

  function handleSort(column: NonNullable<AssetListParams['sortBy']>) {
    setFilters((prev) => {
      const isSame = prev.sortBy === column;
      const nextOrder = isSame && prev.order === 'asc' ? 'desc' : 'asc';
      return { ...prev, sortBy: column, order: nextOrder, page: 1 };
    });
  }

  const hasActiveFilters = filters.search || filters.categoryId || filters.status;

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(asset: AssetDto) {
    setEditing(asset);
    setSheetOpen(true);
  }

  function handleSubmit(formData: AssetFormData) {
    const payload = toAssetPayload(formData);

    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('asset.toast.updated'));
          setSheetOpen(false);
        },
        onError: () =>
          toast.error(t('asset.toast.updateError'), {
            description: t('asset.toast.codeTakenHint'),
          }),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('asset.toast.created'));
          setSheetOpen(false);
        },
        onError: () =>
          toast.error(t('asset.toast.createError'), {
            description: t('asset.toast.codeTakenHint'),
          }),
      });
    }
  }

  function handleExport() {
    exportMutation.mutate(filters, {
      onSuccess: () => toast.success(t('asset.toast.exported')),
      onError: () => toast.error(t('asset.toast.exportError')),
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('asset.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('asset.toast.deleteError'), {
          description: t('asset.toast.deleteHistoryHint'),
        });
        setDeleteTarget(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('asset.list.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('asset.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Can permission="assets:export">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {t('asset.list.export')}
            </Button>
          </Can>
          <Can permission="assets:import">
            <AssetImportWizard />
          </Can>
          <Can permission="assets:create">
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t('asset.form.create')}
            </Button>
          </Can>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
              <Input
                placeholder={t('asset.list.searchPlaceholder')}
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

            {/* Category */}
            <Select
              value={filters.categoryId || 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({
                  ...prev,
                  categoryId: v === 'all' ? undefined : v,
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder={t('asset.list.categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('asset.list.allCategories')}</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select
              value={filters.status || 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({
                  ...prev,
                  status: v === 'all' ? undefined : (v as AssetStatus),
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[150px]">
                <SelectValue placeholder={t('asset.list.statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('asset.list.allStatuses')}</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs gap-1.5 text-text-muted"
              >
                <RotateCcw className="size-3" />
                {t('asset.list.clearFilters')}
              </Button>
            )}
          </div>

          {data?.pagination && (
            <p className="text-xs text-text-muted shrink-0">
              <span className="font-medium text-text-primary">{data.pagination.total}</span>{' '}
              {t('asset.list.countSuffix')}
            </p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-3.5 w-1/3 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="size-7 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
              <AlertTriangle className="size-5 text-danger" />
            </div>
            <p className="text-text-primary font-medium">{tc('states.error')}</p>
            <p className="text-text-muted text-sm mt-1">{t('asset.list.loadError')}</p>
          </div>
        ) : (
          <>
            <AssetTable
              assets={data?.data || []}
              sortBy={filters.sortBy}
              order={filters.order}
              onSort={handleSort}
              onView={(asset) => navigate(`/assets/${asset.id}`)}
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />

            {/* Pagination */}
            {data?.pagination && data.pagination.total > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
                <p className="text-xs text-text-secondary">
                  {t('asset.list.pagination.showing')}{' '}
                  <span className="font-medium text-text-primary">
                    {(data.pagination.page - 1) * data.pagination.limit + 1}
                  </span>
                  {' – '}
                  <span className="font-medium text-text-primary">
                    {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}
                  </span>{' '}
                  {t('asset.list.pagination.of')}{' '}
                  <span className="font-medium text-text-primary">{data.pagination.total}</span>{' '}
                  {t('asset.list.pagination.suffix')}
                </p>

                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={data.pagination.page === 1}
                      onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                    >
                      <ChevronLeft className="size-3.5" />
                      {t('asset.list.pagination.prev')}
                    </Button>
                    <span className="text-xs text-text-muted px-2 min-w-[80px] text-center">
                      {data.pagination.page} / {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={data.pagination.page === data.pagination.totalPages}
                      onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                    >
                      {t('asset.list.pagination.next')}
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Sheet */}
      <AssetFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        asset={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('asset.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('asset.delete.description', { name: deleteTarget?.name })}
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
    </div>
  );
}
