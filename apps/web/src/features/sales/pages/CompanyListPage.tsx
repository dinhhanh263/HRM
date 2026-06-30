import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Building2, Pencil, MoreHorizontal } from 'lucide-react';
import type { SalesCompanyDto } from '@hrm/shared';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCompanies } from '../hooks/useCompanies';
import { CompanyFormSheet } from '../components/CompanyFormSheet';

export function CompanyListPage() {
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SalesCompanyDto | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading } = useCompanies(search);
  const canManage = can('sales:customer_create');

  function openCreate() { setEditing(null); setSheetOpen(true); }
  function openEdit(c: SalesCompanyDto) { setEditing(c); setSheetOpen(true); }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('company.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('company.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-1.5" />
            {t('company.new')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            <Input
              className="pl-8 h-8 w-64 text-xs"
              placeholder={t('company.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-20 rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
              <Building2 size={24} className="text-text-muted" />
            </div>
            <h3 className="font-semibold text-text-primary mb-1">{t('company.empty.title')}</h3>
            <p className="text-sm text-text-secondary max-w-xs mb-4">{t('company.empty.desc')}</p>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} className="mr-1.5" />
                {t('company.new')}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('company.columns.name')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('company.columns.taxCode')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('company.columns.industry')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">{t('company.columns.contacts')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id} className="group h-12">
                  <TableCell className="font-medium text-text-primary">{c.name}</TableCell>
                  <TableCell className="text-sm text-text-secondary tabular-nums">{c.taxCode || '—'}</TableCell>
                  <TableCell className="text-sm text-text-secondary">{c.industry || '—'}</TableCell>
                  <TableCell className="text-sm text-text-secondary text-right tabular-nums">{c.customerCount}</TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil size={14} className="mr-2" />
                            {t('company.form.editTitle')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CompanyFormSheet open={sheetOpen} onOpenChange={setSheetOpen} company={editing} />
    </div>
  );
}
