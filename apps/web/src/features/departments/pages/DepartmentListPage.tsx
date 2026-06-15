import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DepartmentDto } from '@hrm/shared';
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
import { DepartmentTable } from '../components/DepartmentTable';
import { DepartmentFormSheet, type DepartmentFormData } from '../components/DepartmentFormSheet';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from '../hooks/useDepartments';
import { Plus, Search, X, AlertTriangle } from 'lucide-react';

export function DepartmentListPage() {
  const { t } = useTranslation('department');
  const { t: tc } = useTranslation('common');
  const [searchInput, setSearchInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentDto | null>(null);

  const { data, isLoading, error } = useDepartments();
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment(editing?.id ?? '');
  const deleteMutation = useDeleteDepartment();

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = searchInput.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q)
    );
  }, [data, searchInput]);

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(department: DepartmentDto) {
    setEditing(department);
    setSheetOpen(true);
  }

  function handleSubmit(formData: DepartmentFormData) {
    const payload = {
      name: formData.name,
      description: formData.description?.trim() ? formData.description : undefined,
    };

    if (editing) {
      // `?? null` so clearing the department head ("Không có") is persisted.
      updateMutation.mutate({ ...payload, managerId: formData.managerId ?? null }, {
        onSuccess: () => {
          toast.success(t('toast.updated'));
          setSheetOpen(false);
        },
        onError: () =>
          toast.error(t('toast.updateError'), { description: t('toast.updateErrorDescription') }),
      });
    } else {
      createMutation.mutate({ ...payload, managerId: formData.managerId || undefined }, {
        onSuccess: () => {
          toast.success(t('toast.created'));
          setSheetOpen(false);
        },
        onError: () =>
          toast.error(t('toast.createError'), {
            description: t('toast.createErrorDescription'),
          }),
      });
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('toast.deleteError'), { description: t('toast.deleteErrorDescription') });
        setDeleteTarget(null);
      },
    });
  }

  const hasEmployees = (deleteTarget?.employeeCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('list.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('list.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          {t('form.create')}
        </Button>
      </div>

      {/* Table Card */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
            <Input
              placeholder={t('list.searchPlaceholder')}
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

          {data && (
            <p className="text-xs text-text-muted shrink-0">
              <span className="font-medium text-text-primary">{data.length}</span>{' '}
              {t('list.count')}
            </p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-3.5 w-1/3 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="size-7 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
              <AlertTriangle className="size-5 text-danger" />
            </div>
            <p className="text-text-primary font-medium">{t('errorState.title')}</p>
            <p className="text-text-muted text-sm mt-1">{t('errorState.description')}</p>
          </div>
        ) : (
          <DepartmentTable
            departments={filtered}
            onCreate={openCreate}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      {/* Create / Edit Sheet */}
      <DepartmentFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        department={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasEmployees
                ? t('delete.hasEmployees', {
                    name: deleteTarget?.name,
                    count: deleteTarget?.employeeCount ?? 0,
                  })
                : t('delete.description', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={hasEmployees || deleteMutation.isPending}
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
