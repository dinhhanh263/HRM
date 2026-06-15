import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EmployeeListQuery, EmployeeStatus } from '@hrm/shared';
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
import { EmployeeTable } from '../components/EmployeeTable';
import { EmployeeImportWizard } from '../components/EmployeeImportWizard';
import {
  useEmployees,
  useActivateEmployee,
  useDeactivateEmployee,
  useTerminateEmployee,
} from '../hooks/useEmployees';
import { useDepartments } from '../hooks/useDepartments';
import { Plus, Search, RotateCcw, ChevronLeft, ChevronRight, X, AlertTriangle } from 'lucide-react';

export function EmployeeListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('employee');
  const [filters, setFilters] = useState<EmployeeListQuery>({
    page: 1,
    limit: 20,
  });
  const [searchInput, setSearchInput] = useState('');
  const [terminateId, setTerminateId] = useState<string | null>(null);

  const { data, isLoading, error } = useEmployees(filters);
  const { data: departments } = useDepartments();
  const activateMutation = useActivateEmployee();
  const deactivateMutation = useDeactivateEmployee();
  const terminateMutation = useTerminateEmployee();

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

  function handleSort(column: NonNullable<EmployeeListQuery['sort']>) {
    setFilters((prev) => {
      const isSame = prev.sort === column;
      const nextOrder = isSame && prev.order === 'asc' ? 'desc' : 'asc';
      return { ...prev, sort: column, order: nextOrder, page: 1 };
    });
  }

  const hasActiveFilters =
    filters.search || filters.departmentId || filters.status || filters.contractType;

  function handleActivate(id: string) {
    activateMutation.mutate(id, {
      onSuccess: () => toast.success(t('toast.activated')),
      onError: () => toast.error(t('toast.activateError'), { description: t('toast.tryAgain') }),
    });
  }

  function handleDeactivate(id: string) {
    deactivateMutation.mutate(id, {
      onSuccess: () => toast.success(t('toast.deactivated')),
      onError: () => toast.error(t('toast.deactivateError'), { description: t('toast.tryAgain') }),
    });
  }

  function handleTerminateConfirm() {
    if (!terminateId) return;
    terminateMutation.mutate(terminateId, {
      onSuccess: () => {
        toast.success(t('toast.terminated'));
        setTerminateId(null);
      },
      onError: () => {
        toast.error(t('toast.terminateError'), { description: t('toast.tryAgain') });
        setTerminateId(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('list.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {t('list.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Can permission="employees:import">
            <EmployeeImportWizard />
          </Can>
          <Can permission="employees:create">
            <Button onClick={() => navigate('/employees/new')}>
              <Plus className="w-4 h-4 mr-2" />
              {t('list.addEmployee')}
            </Button>
          </Can>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
          {/* Left: search + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Department */}
            <Select
              value={filters.departmentId || 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({
                  ...prev,
                  departmentId: v === 'all' ? undefined : v,
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[150px]">
                <SelectValue placeholder={t('list.departmentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.allDepartments')}</SelectItem>
                {departments?.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
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
                  status: v === 'all' ? undefined : (v as EmployeeStatus),
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue placeholder={t('list.statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.allStatuses')}</SelectItem>
                <SelectItem value="ACTIVE">{t('status.active')}</SelectItem>
                <SelectItem value="INACTIVE">{t('status.inactive')}</SelectItem>
                <SelectItem value="TERMINATED">{t('status.terminated')}</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1.5 text-text-muted">
                <RotateCcw className="size-3" />
                {t('list.clearFilters')}
              </Button>
            )}
          </div>

          {/* Right: count */}
          {data?.pagination && (
            <p className="text-xs text-text-muted shrink-0">
              <span className="font-medium text-text-primary">{data.pagination.total}</span> {t('list.countSuffix')}
            </p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-3.5 w-1/3 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <Skeleton className="h-3 w-16 rounded hidden md:block" />
                <Skeleton className="h-3 w-24 rounded hidden lg:block" />
                <Skeleton className="h-3 w-20 rounded hidden lg:block" />
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
            <p className="text-text-primary font-medium">{t('states.error', { ns: 'common' })}</p>
            <p className="text-text-muted text-sm mt-1">{t('list.loadError')}</p>
          </div>
        ) : (
          <>
            <EmployeeTable
              employees={data?.data || []}
              sort={filters.sort}
              order={filters.order}
              onSort={handleSort}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onTerminate={(id) => setTerminateId(id)}
            />

            {/* Pagination */}
            {data?.pagination && data.pagination.total > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
                <p className="text-xs text-text-secondary">
                  {t('list.pagination.showing')}{' '}
                  <span className="font-medium text-text-primary">
                    {(data.pagination.page - 1) * data.pagination.limit + 1}
                  </span>
                  {' – '}
                  <span className="font-medium text-text-primary">
                    {Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total
                    )}
                  </span>
                  {' '}{t('list.pagination.of')}{' '}
                  <span className="font-medium text-text-primary">{data.pagination.total}</span>
                  {' '}{t('list.pagination.suffix')}
                </p>

                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={data.pagination.page === 1}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                      }
                    >
                      <ChevronLeft className="size-3.5" />
                      {t('list.pagination.prev')}
                    </Button>
                    <span className="text-xs text-text-muted px-2 min-w-[80px] text-center">
                      {data.pagination.page} / {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={data.pagination.page === data.pagination.totalPages}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                      }
                    >
                      {t('list.pagination.next')}
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Terminate Confirmation Dialog */}
      <AlertDialog open={!!terminateId} onOpenChange={(open) => !open && setTerminateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('terminateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('terminateDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTerminateConfirm}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={terminateMutation.isPending}
            >
              {terminateMutation.isPending ? t('form.submitting') : t('terminateDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
