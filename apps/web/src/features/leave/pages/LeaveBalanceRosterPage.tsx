import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  Search,
  X,
  RotateCcw,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import type { LeaveBalanceDto, LeaveTypeSummaryDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import {
  useLeaveBalanceRoster,
  useExportLeaveRoster,
  type LeaveRosterQuery,
} from '../hooks/useLeave';

const PAGE_SIZE = 20;

/** Build a leaveTypeId → balance lookup so each cell renders by column id,
 *  independent of the per-row balances array order. */
function balanceMap(balances: LeaveBalanceDto[]): Map<string, LeaveBalanceDto> {
  return new Map(balances.map((b) => [b.leaveTypeId, b]));
}

export function LeaveBalanceRosterPage() {
  const { t } = useTranslation('leave');
  const { data: departments } = useDepartments();

  const [query, setQuery] = useState<LeaveRosterQuery>({
    year: new Date().getUTCFullYear(),
    page: 1,
    limit: PAGE_SIZE,
  });
  const [searchInput, setSearchInput] = useState('');

  // Debounce the search box so typing doesn't fire a request per keystroke;
  // any change resets to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error } = useLeaveBalanceRoster(query);
  const exportRoster = useExportLeaveRoster();

  const leaveTypes = data?.leaveTypes ?? [];
  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const hasActiveFilters = !!query.search || !!query.departmentId;
  const hasRows = (pagination?.total ?? 0) > 0;

  function clearFilters() {
    setSearchInput('');
    setQuery((prev) => ({ ...prev, search: undefined, departmentId: undefined, page: 1 }));
  }

  function handleExport() {
    exportRoster.mutate(
      { year: query.year, departmentId: query.departmentId, search: query.search },
      { onError: () => toast.error(t('roster.exportError')) },
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('roster.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('roster.subtitle')}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Year stepper */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setQuery((prev) => ({ ...prev, year: prev.year - 1, page: 1 }))}
                aria-label={t('roster.prevYear')}
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="px-2 text-sm font-semibold text-text-primary tabular-nums min-w-[3.5rem] text-center">
                {query.year}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setQuery((prev) => ({ ...prev, year: prev.year + 1, page: 1 }))}
                aria-label={t('roster.nextYear')}
              >
                <ChevronRight size={16} />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
              <Input
                placeholder={t('roster.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`pl-8 h-8 w-56 text-xs ${searchInput ? 'pr-7' : ''}`}
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  aria-label={t('roster.clearFilters')}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Department */}
            <Select
              value={query.departmentId || 'all'}
              onValueChange={(v) =>
                setQuery((prev) => ({
                  ...prev,
                  departmentId: v === 'all' ? undefined : v,
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder={t('roster.allDepartments')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('roster.allDepartments')}</SelectItem>
                {departments?.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
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
                {t('roster.clearFilters')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isLoading && !error && pagination && (
              <p className="text-xs text-text-muted tabular-nums">
                {t('roster.total', { count: pagination.total })}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleExport}
              disabled={exportRoster.isPending || isLoading || !!error || !hasRows}
            >
              {exportRoster.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {exportRoster.isPending ? t('roster.exporting') : t('roster.export')}
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <RosterSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
              <AlertTriangle className="size-5 text-danger" />
            </div>
            <p className="text-text-primary font-medium">{t('states.error', { ns: 'common' })}</p>
            <p className="text-text-muted text-sm mt-1">{t('roster.loadError')}</p>
          </div>
        ) : leaveTypes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-text-muted text-sm">{t('roster.noLeaveTypes')}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
              <Users size={24} className="text-text-muted" />
            </div>
            <h3 className="font-semibold text-text-primary mb-1">{t('roster.empty')}</h3>
            <p className="text-sm text-text-muted max-w-xs">{t('roster.emptyHint')}</p>
          </div>
        ) : (
          <>
            <RosterTable leaveTypes={leaveTypes} rows={rows} t={t} />

            {/* Pagination */}
            {pagination && pagination.total > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
                <p className="text-xs text-text-secondary tabular-nums">
                  {t('roster.pagination.showing')}{' '}
                  <span className="font-medium text-text-primary">
                    {(pagination.page - 1) * pagination.limit + 1}
                  </span>
                  {' – '}
                  <span className="font-medium text-text-primary">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  {t('roster.pagination.of')}{' '}
                  <span className="font-medium text-text-primary">{pagination.total}</span>{' '}
                  {t('roster.pagination.suffix')}
                </p>

                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={pagination.page === 1}
                      onClick={() => setQuery((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
                    >
                      <ChevronLeft className="size-3.5" />
                      {t('roster.pagination.prev')}
                    </Button>
                    <span className="text-xs text-text-muted px-2 min-w-[70px] text-center tabular-nums">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={pagination.page === pagination.totalPages}
                      onClick={() => setQuery((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                    >
                      {t('roster.pagination.next')}
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface RosterTableProps {
  leaveTypes: LeaveTypeSummaryDto[];
  rows: {
    employee: {
      id: string;
      fullName: string;
      employeeCode: string;
      avatar?: string | null;
      departmentName?: string | null;
    };
    balances: LeaveBalanceDto[];
  }[];
  t: TFunction;
}

function RosterTable({ leaveTypes, rows, t }: RosterTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-alt">
            {/* Frozen employee column */}
            <th
              scope="col"
              className="sticky left-0 z-20 bg-surface-alt text-left px-4 py-2.5 font-semibold text-text-secondary uppercase tracking-wide text-xs min-w-[14rem]"
            >
              {t('roster.employee')}
            </th>
            {leaveTypes.map((lt) => (
              <th
                key={lt.id}
                scope="col"
                className="px-4 py-2.5 text-right font-semibold text-text-secondary uppercase tracking-wide text-xs whitespace-nowrap min-w-[7rem]"
              >
                {lt.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const byType = balanceMap(row.balances);
            return (
              <tr key={row.employee.id} className="group hover:bg-surface-alt/50 transition-colors">
                <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-alt/50 px-4 py-3 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="size-8 shrink-0">
                      {row.employee.avatar && <AvatarImage src={row.employee.avatar} alt="" />}
                      <AvatarFallback className="text-xs bg-primary-light text-primary font-medium">
                        {getInitials(row.employee.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate leading-none">
                        {row.employee.fullName}
                      </p>
                      <p className="text-xs text-text-muted mt-1 truncate">
                        {row.employee.departmentName || t('roster.noDepartment')}
                      </p>
                    </div>
                  </div>
                </td>
                {leaveTypes.map((lt) => {
                  const b = byType.get(lt.id);
                  const remaining = b?.remaining ?? 0;
                  const used = b?.used ?? 0;
                  const pending = b?.pending ?? 0;
                  return (
                    <td
                      key={lt.id}
                      className="px-4 py-3 text-right align-top tabular-nums"
                      aria-label={t('roster.cellAria', {
                        type: lt.name,
                        remaining,
                        used,
                        pending,
                      })}
                    >
                      <span className="block text-sm font-semibold text-text-primary">
                        {remaining}
                      </span>
                      <span className="block text-xs text-text-muted mt-0.5">
                        {t('roster.used')} {used}
                        {pending > 0 && (
                          <span className="text-warning">
                            {' · '}
                            {t('roster.pending')} {pending}
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="size-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-3.5 w-1/4 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}
