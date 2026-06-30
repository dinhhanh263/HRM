import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, Search, Package, Pencil, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ProductDto } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useProducts, useDeleteProduct, isProductInUse } from '../hooks/useProducts';
import { ProductFormSheet } from '../components/ProductFormSheet';

function money(v: string, c: string) {
  try { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)); }
  catch { return `${Number(v).toLocaleString('vi-VN')} ${c}`; }
}

export function ProductListPage() {
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const canManage = can('sales:product_manage');

  useEffect(() => { const id = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(id); }, [searchInput]);
  const { data, isLoading } = useProducts(search);
  const deleteMut = useDeleteProduct();

  async function remove(p: ProductDto) {
    try { await deleteMut.mutateAsync(p.id); toast.success(t('product.toast.deleted')); }
    catch (err) { toast.error(isProductInUse(err) ? t('product.inUse') : t('product.toast.error')); }
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('product.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('product.subtitle')}</p>
        </div>
        {canManage && <Button onClick={() => { setEditing(null); setSheetOpen(true); }}><Plus size={16} className="mr-1.5" />{t('product.new')}</Button>}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            <Input className="pl-8 h-8 w-64 text-xs" placeholder={t('product.search')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <div className="divide-y divide-border">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-4 px-4 py-3.5"><Skeleton className="h-4 w-48 rounded" /><Skeleton className="h-4 w-24 rounded ml-auto" /></div>)}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4"><Package size={24} className="text-text-muted" /></div>
            <h3 className="font-semibold text-text-primary mb-1">{t('product.empty.title')}</h3>
            <p className="text-sm text-text-secondary max-w-xs mb-4">{t('product.empty.desc')}</p>
            {canManage && <Button size="sm" onClick={() => { setEditing(null); setSheetOpen(true); }}><Plus size={14} className="mr-1.5" />{t('product.new')}</Button>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('product.columns.name')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('product.columns.sku')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">{t('product.columns.price')}</TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('product.columns.status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p.id} className="group h-12">
                  <TableCell className="font-medium text-text-primary">{p.name}{p.unit && <span className="block text-xs text-text-muted">{p.unit}</span>}</TableCell>
                  <TableCell className="text-sm text-text-secondary tabular-nums">{p.sku || '—'}</TableCell>
                  <TableCell className="text-sm text-text-secondary text-right tabular-nums">{money(p.unitPrice, p.currency)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn('text-xs', p.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700')}>{t(`product.status.${p.status}`)}</Badge></TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(p); setSheetOpen(true); }}><Pencil size={14} className="mr-2" />{t('product.form.editTitle')}</DropdownMenuItem>
                          <DropdownMenuItem className="text-danger" onClick={() => remove(p)}><Trash2 size={14} className="mr-2" />{t('product.delete')}</DropdownMenuItem>
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
      <ProductFormSheet open={sheetOpen} onOpenChange={setSheetOpen} product={editing} />
    </div>
  );
}
