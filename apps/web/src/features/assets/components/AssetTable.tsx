import { useTranslation } from 'react-i18next';
import type { AssetDto, AssetListParams } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Can } from '@/components/auth/Can';
import { AssetStatusBadge } from './AssetStatusBadge';
import { MoreHorizontal, Pencil, Trash2, Eye, Package, Plus, ArrowUpDown } from 'lucide-react';

type SortColumn = NonNullable<AssetListParams['sortBy']>;

interface AssetTableProps {
  assets: AssetDto[];
  sortBy?: SortColumn;
  order?: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  onView: (asset: AssetDto) => void;
  onCreate: () => void;
  onEdit: (asset: AssetDto) => void;
  onDelete: (asset: AssetDto) => void;
}

export function AssetTable({
  assets,
  sortBy,
  order,
  onSort,
  onView,
  onCreate,
  onEdit,
  onDelete,
}: AssetTableProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">{t('asset.empty.title')}</p>
        <p className="text-text-muted text-sm mt-2">{t('asset.empty.description')}</p>
        <Can permission="assets:create">
          <Button className="mt-4" size="sm" onClick={onCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t('asset.form.create')}
          </Button>
        </Can>
      </div>
    );
  }

  // aria-sort belongs on the columnheader (<th>), not the inner button.
  const ariaSort = (column: SortColumn): 'ascending' | 'descending' | 'none' =>
    sortBy === column ? (order === 'asc' ? 'ascending' : 'descending') : 'none';

  const sortableHeader = (column: SortColumn, label: string, align: 'left' | 'right' = 'left') => {
    const active = sortBy === column;
    return (
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors hover:text-text-primary ${
          align === 'right' ? 'ml-auto' : ''
        } ${active ? 'text-text-primary' : 'text-text-secondary'}`}
      >
        {label}
        <ArrowUpDown
          className={`w-3 h-3 transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}
        />
      </button>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-border border-b-2 border-border-strong">
          <tr>
            <th className="px-4 py-3.5 text-left" aria-sort={ariaSort('assetCode')}>
              {sortableHeader('assetCode', t('asset.table.code'))}
            </th>
            <th className="px-4 py-3.5 text-left" aria-sort={ariaSort('name')}>
              {sortableHeader('name', t('asset.table.name'))}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-secondary uppercase tracking-wider">
              {t('asset.table.category')}
            </th>
            <th className="px-4 py-3.5 text-left" aria-sort={ariaSort('status')}>
              {sortableHeader('status', t('asset.table.status'))}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-secondary uppercase tracking-wider">
              {t('asset.table.holder')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-secondary uppercase tracking-wider">
              {t('asset.table.location')}
            </th>
            <th className="px-4 py-3.5 w-[60px]" />
          </tr>
        </thead>

        <tbody>
          {assets.map((asset) => {
            const holder = asset.currentAssignment?.employee;
            return (
              <tr
                key={asset.id}
                onClick={() => onView(asset)}
                className="group cursor-pointer transition-colors duration-150 hover:bg-surface-alt bg-surface"
              >
                <td className="px-4 py-4 align-middle border-b border-border">
                  <code className="text-xs font-medium text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">
                    {asset.assetCode}
                  </code>
                </td>

                <td className="px-4 py-4 align-middle border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                      <Package className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary truncate m-0">{asset.name}</p>
                      {(asset.brand || asset.model) && (
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {[asset.brand, asset.model].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-4 py-4 align-middle border-b border-border">
                  <span className="text-text-secondary">
                    {asset.category?.name ?? '—'}
                  </span>
                </td>

                <td className="px-4 py-4 align-middle border-b border-border">
                  <AssetStatusBadge status={asset.status} />
                </td>

                <td className="px-4 py-4 align-middle border-b border-border">
                  {holder ? (
                    <span className="text-text-secondary">{holder.fullName}</span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>

                <td className="px-4 py-4 align-middle border-b border-border">
                  <span className={asset.location ? 'text-text-secondary' : 'text-text-muted'}>
                    {asset.location || '—'}
                  </span>
                </td>

                <td
                  className="px-4 py-4 align-middle border-b border-border"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-8 h-8 p-0"
                          aria-label={tc('actions.actions')}
                        >
                          <MoreHorizontal className="w-[18px] h-[18px]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={() => onView(asset)}>
                          <Eye className="w-4 h-4 mr-2" />
                          {tc('actions.viewDetail')}
                        </DropdownMenuItem>
                        <Can permission="assets:update">
                          <DropdownMenuItem onClick={() => onEdit(asset)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {tc('actions.edit')}
                          </DropdownMenuItem>
                        </Can>
                        <Can permission="assets:delete">
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(asset)}
                            className="text-danger"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {tc('actions.delete')}
                          </DropdownMenuItem>
                        </Can>
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
  );
}
