import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CashTransactionDto, CashTransactionListQuery, TransactionDirection } from '@hrm/shared';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { formatVnd } from '@/lib/utils';
import { Plus, Search, X, MoreHorizontal, Pencil, Trash2, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Upload } from 'lucide-react';
import { useFundAccounts, useIssuingEntitiesLite } from '../hooks/useFundAccounts';
import { CashTransactionImportSheet } from '../components/CashTransactionImportSheet';
import {
  useCashTransactions,
  useCreateCashTransaction,
  useUpdateCashTransaction,
  useDeleteCashTransaction,
} from '../hooks/useCashTransactions';
import { CashTransactionFormSheet, type CashTransactionFormData } from '../components/CashTransactionFormSheet';

const ALL = '__all__';
const PAGE_SIZE = 20;

export function CashTransactionsPage() {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');

  const [entityId, setEntityId] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [direction, setDirection] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Debounce the search box into the query (300ms) — matches the other list pages.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<CashTransactionDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashTransactionDto | null>(null);

  const query: CashTransactionListQuery = useMemo(
    () => ({
      issuingEntityId: entityId === ALL ? undefined : entityId,
      accountId: accountId === ALL ? undefined : accountId,
      direction: direction === ALL ? undefined : (direction as TransactionDirection),
      status: status === ALL ? undefined : (status as 'ACTUAL' | 'PLANNED'),
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [entityId, accountId, direction, status, search, page],
  );

  const { data, isLoading } = useCashTransactions(query);
  const { data: entities = [] } = useIssuingEntitiesLite();
  const { data: accounts = [] } = useFundAccounts({ active: true });
  const createMutation = useCreateCashTransaction();
  const updateMutation = useUpdateCashTransaction();
  const deleteMutation = useDeleteCashTransaction();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function handleSubmit(form: CashTransactionFormData) {
    const onOk = (msg: string) => {
      toast.success(msg);
      setSheetOpen(false);
    };
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, ...form },
        { onSuccess: () => onOk(t('transactions.toast.updated')), onError: () => toast.error(t('transactions.toast.saveError')) },
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => onOk(t('transactions.toast.created')),
        onError: () => toast.error(t('transactions.toast.saveError')),
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('transactions.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('transactions.toast.deleteError'));
        setDeleteTarget(null);
      },
    });
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('transactions.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('transactions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            {t('transactions.import')}
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('transactions.form.create')}
          </Button>
        </div>
      </div>

      {/* Totals bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TotalCard label={t('transactions.totals.in')} value={data?.totalIn} tone="in" />
        <TotalCard label={t('transactions.totals.out')} value={data?.totalOut} tone="out" />
        <TotalCard label={t('transactions.totals.net')} value={data?.net} tone="net" />
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
            <Input
              placeholder={t('transactions.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              className={`pl-8 h-8 w-52 text-xs ${searchInput ? 'pr-7' : ''}`}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                aria-label={tc('actions.clearSearch')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <FilterSelect value={entityId} onChange={resetToFirstPage(setEntityId)} allLabel={t('transactions.filters.allEntities')} options={entities.map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect value={accountId} onChange={resetToFirstPage(setAccountId)} allLabel={t('transactions.filters.allAccounts')} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <FilterSelect value={direction} onChange={resetToFirstPage(setDirection)} allLabel={t('transactions.filters.allDirections')} options={[{ value: 'IN', label: t('transactions.direction.IN') }, { value: 'OUT', label: t('transactions.direction.OUT') }]} />
          <FilterSelect value={status} onChange={resetToFirstPage(setStatus)} allLabel={t('transactions.filters.allStatuses')} options={[{ value: 'ACTUAL', label: t('transactions.status.ACTUAL') }, { value: 'PLANNED', label: t('transactions.status.PLANNED') }]} />
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
              <ArrowRightLeft className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-primary font-medium">{t('transactions.empty.title')}</p>
            <p className="text-text-muted text-sm mt-2">{t('transactions.empty.description')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-border border-b-2 border-border-strong">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[110px]">{t('transactions.table.date')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider">{t('transactions.table.detail')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[150px]">{t('transactions.table.account')}</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[160px]">{t('transactions.table.amount')}</th>
                  <th className="px-4 py-3 w-[52px]" />
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => {
                  const isIn = tx.direction === 'IN';
                  return (
                    <tr key={tx.id} className={`group hover:bg-surface-alt bg-surface ${tx.status === 'PLANNED' ? 'opacity-70' : ''}`}>
                      <td className="px-4 py-3 align-middle border-b border-border text-text-secondary tabular-nums whitespace-nowrap">
                        {tx.occurredAt.slice(0, 10).split('-').reverse().join('/')}
                      </td>
                      <td className="px-4 py-3 align-middle border-b border-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium shrink-0 ${isIn ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
                            {isIn ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                            {tx.categoryName ?? t(`transactions.direction.${tx.direction}`)}
                          </span>
                          <span className="text-text-secondary truncate">{tx.description ?? tx.reference ?? ''}</span>
                          {tx.status === 'PLANNED' && (
                            <span className="text-[10px] uppercase rounded bg-info-light text-info px-1 py-0.5 shrink-0">{t('transactions.status.PLANNED')}</span>
                          )}
                        </div>
                        {tx.departmentName && <span className="text-xs text-text-muted">{tx.departmentName}</span>}
                      </td>
                      <td className="px-4 py-3 align-middle border-b border-border">
                        <span className="text-text-secondary">{tx.accountName}</span>
                        <span className="block text-xs text-text-muted">{tx.issuingEntityName}</span>
                      </td>
                      <td className={`px-4 py-3 align-middle border-b border-border text-right font-semibold tabular-nums ${isIn ? 'text-success' : 'text-text-primary'}`}>
                        {isIn ? '+' : '−'}{formatVnd(tx.amount)}
                      </td>
                      <td className="px-4 py-3 align-middle border-b border-border">
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="size-7 p-0" aria-label={tc('actions.actions')}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[150px]">
                              <DropdownMenuItem onClick={() => { setEditing(tx); setSheetOpen(true); }}>
                                <Pencil className="size-4 mr-2" />
                                {tc('actions.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteTarget(tx)} className="text-danger">
                                <Trash2 className="size-4 mr-2" />
                                {tc('actions.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer / pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-text-muted">
              {t('transactions.pagination.total', { count: data.total })}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('transactions.pagination.prev')}
              </Button>
              <span className="text-xs text-text-muted tabular-nums">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {t('transactions.pagination.next')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <CashTransactionFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        transaction={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <CashTransactionImportSheet open={importOpen} onOpenChange={setImportOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('transactions.delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="bg-danger hover:bg-danger/90 text-white">
              {deleteMutation.isPending ? tc('states.deleting') : tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TotalCard({ label, value, tone }: { label: string; value?: string; tone: 'in' | 'out' | 'net' }) {
  const color = tone === 'in' ? 'text-success' : tone === 'out' ? 'text-warning' : 'text-text-primary';
  return (
    <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${color}`}>{formatVnd(value)}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
