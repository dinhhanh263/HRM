import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, Search, Contact, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, UserPlus, UserCog, X, Upload } from 'lucide-react';
import type { CustomerDto, ListCustomersQuery, CustomerLifecycle, CustomerType } from '@hrm/shared';
import { CustomerLifecycle as LifecycleEnum, CustomerType as TypeEnum } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCustomers,
  useClaimCustomer,
  useAssignCustomer,
  useBulkAssign,
} from '../hooks/useCustomers';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { AssignOwnerDialog } from '../components/AssignOwnerDialog';
import { CustomerImportWizard } from '../components/CustomerImportWizard';
import { LifecycleBadge } from '../components/LifecycleBadge';

const ALL = '__all__';

export function CustomerListPage() {
  const { t } = useTranslation('sales');
  const navigate = useNavigate();
  const { can } = usePermission();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>(ALL);
  const [lifecycle, setLifecycle] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const canAssign = can('sales:customer_assign');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Assign dialog target: a single customer id, or 'bulk' for the selection.
  const [assignTarget, setAssignTarget] = useState<string | 'bulk' | null>(null);

  const claimMut = useClaimCustomer();
  const assignMut = useAssignCustomer();
  const bulkMut = useBulkAssign();
  const assignPending = assignMut.isPending || bulkMut.isPending;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleClaim(id: string) {
    try {
      await claimMut.mutateAsync(id);
      toast.success(t('assign.toastClaimed'));
    } catch {
      toast.error(t('assign.toastError'));
    }
  }

  async function handleAssignConfirm(ownerId: string | null) {
    try {
      if (assignTarget === 'bulk') {
        const ids = [...selected];
        const { count } = await bulkMut.mutateAsync({ customerIds: ids, ownerId });
        toast.success(t('assign.toastBulk', { count }));
        setSelected(new Set());
      } else if (assignTarget) {
        await assignMut.mutateAsync({ id: assignTarget, ownerId });
        toast.success(t('assign.toastAssigned'));
      }
      setAssignTarget(null);
    } catch {
      toast.error(t('assign.toastError'));
    }
  }

  // Debounce search 300ms (ui-modern.md).
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query: ListCustomersQuery = useMemo(
    () => ({
      page,
      limit: 20,
      search: search || undefined,
      type: type === ALL ? undefined : (type as CustomerType),
      lifecycleStatus: lifecycle === ALL ? undefined : (lifecycle as CustomerLifecycle),
      ownerId: owner === ALL ? undefined : owner,
    }),
    [page, search, type, lifecycle, owner],
  );

  const { data, isLoading, isError, refetch } = useCustomers(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }
  function openEdit(c: CustomerDto) {
    setEditing(c);
    setSheetOpen(true);
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('customers.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('customers.subtitle')}</p>
        </div>
        {can('sales:customer_create') && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={16} className="mr-1.5" />
              {t('import.button')}
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1.5" />
              {t('customers.new')}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            <Input
              className="pl-8 h-8 w-64 text-xs"
              placeholder={t('customers.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <FilterSelect
            value={type}
            onChange={(v) => { setType(v); setPage(1); }}
            label={t('customers.filters.type')}
            options={Object.values(TypeEnum).map((v) => ({ value: v, label: t(`type.${v}`) }))}
          />
          <FilterSelect
            value={lifecycle}
            onChange={(v) => { setLifecycle(v); setPage(1); }}
            label={t('customers.filters.lifecycle')}
            options={Object.values(LifecycleEnum).map((v) => ({ value: v, label: t(`lifecycle.${v}`) }))}
          />
          <FilterSelect
            value={owner}
            onChange={(v) => { setOwner(v); setPage(1); }}
            label={t('customers.filters.owner')}
            options={[{ value: 'pool', label: t('customers.filters.pool') }]}
          />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-medium text-text-primary mb-2">{t('customers.error.title')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t('customers.error.retry')}
            </Button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState onCreate={can('sales:customer_create') ? openCreate : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                {canAssign && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="select-all"
                      className="size-4 rounded border-border accent-primary align-middle"
                      checked={data.items.length > 0 && data.items.every((c) => selected.has(c.id))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(data.items.map((c) => c.id)) : new Set())
                      }
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.name')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.type')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.contact')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.lifecycle')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.owner')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('customers.columns.createdAt')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow
                  key={c.id}
                  className="group h-12 cursor-pointer hover:bg-surface-alt/40"
                  onClick={() => navigate(`/sales/customers/${c.id}`)}
                >
                  {canAssign && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`select-${c.id}`}
                        className="size-4 rounded border-border accent-primary align-middle"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-text-primary">
                    {c.fullName}
                    {c.title && <span className="block text-xs text-text-muted">{c.title}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">{t(`type.${c.type}`)}</TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {c.email && <span className="block">{c.email}</span>}
                    {c.phone && <span className="block text-xs text-text-muted tabular-nums">{c.phone}</span>}
                  </TableCell>
                  <TableCell><LifecycleBadge status={c.lifecycleStatus} /></TableCell>
                  <TableCell className="text-sm">
                    {c.owner ? (
                      <span className="text-text-secondary">{c.owner.fullName}</span>
                    ) : (
                      <span className="text-text-muted italic">{t('customers.unassigned')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {(can('sales:customer_update') || canAssign) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {can('sales:customer_update') && (
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil size={14} className="mr-2" />
                              {t('form.editTitle')}
                            </DropdownMenuItem>
                          )}
                          {can('sales:customer_update') && !c.ownerId && (
                            <DropdownMenuItem onClick={() => handleClaim(c.id)}>
                              <UserPlus size={14} className="mr-2" />
                              {t('assign.claim')}
                            </DropdownMenuItem>
                          )}
                          {canAssign && (
                            <DropdownMenuItem onClick={() => setAssignTarget(c.id)}>
                              <UserCog size={14} className="mr-2" />
                              {t('assign.assignAction')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-text-muted">{t('customers.count', { count: data.total })}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </Button>
              <span className="text-xs text-text-secondary tabular-nums px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <CustomerFormSheet open={sheetOpen} onOpenChange={setSheetOpen} customer={editing} />
      <CustomerImportWizard open={importOpen} onOpenChange={setImportOpen} />

      {/* Bulk action bar — floating, glass (ui-modern.md §5). */}
      {canAssign && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-text-primary/95 px-5 py-3 text-background shadow-lg backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm font-medium">{t('assign.selected', { count: selected.size })}</span>
          <span className="h-5 w-px bg-background/20" />
          <Button variant="ghost" size="sm" className="h-7 text-background hover:bg-white/10" onClick={() => setAssignTarget('bulk')}>
            <UserCog size={13} className="mr-1.5" />
            {t('assign.assignAction')}
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-1 text-background/60 hover:text-background transition-colors" aria-label={t('assign.clear')}>
            <X size={14} />
          </button>
        </div>
      )}

      <AssignOwnerDialog
        open={assignTarget !== null}
        onOpenChange={(o) => !o && setAssignTarget(null)}
        count={assignTarget === 'bulk' ? selected.size : 1}
        pending={assignPending}
        onConfirm={handleAssignConfirm}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation('sales');
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: {t('customers.filters.all')}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-24 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation('sales');
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
        <Contact size={24} className="text-text-muted" />
      </div>
      <h3 className="font-semibold text-text-primary mb-1">{t('customers.empty.title')}</h3>
      <p className="text-sm text-text-secondary max-w-xs mb-4">{t('customers.empty.desc')}</p>
      {onCreate && (
        <Button size="sm" onClick={onCreate}>
          <Plus size={14} className="mr-1.5" />
          {t('customers.new')}
        </Button>
      )}
    </div>
  );
}
