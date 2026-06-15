import { useTranslation } from 'react-i18next';
import type { AssetCategoryDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Boxes, Plus, Package } from 'lucide-react';

interface AssetCategoryTableProps {
  categories: AssetCategoryDto[];
  onCreate: () => void;
  onEdit: (category: AssetCategoryDto) => void;
  onDelete: (category: AssetCategoryDto) => void;
}

export function AssetCategoryTable({
  categories,
  onCreate,
  onEdit,
  onDelete,
}: AssetCategoryTableProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Boxes className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">{t('category.empty.title')}</p>
        <p className="text-text-muted text-sm mt-2">{t('category.empty.description')}</p>
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('category.form.create')}
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-border border-b-2 border-border-strong">
          <tr>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[260px]">
              {t('category.table.name')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[140px]">
              {t('category.table.code')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider">
              {t('category.table.description')}
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[120px]">
              {t('category.table.assetColumn')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[60px]" />
          </tr>
        </thead>

        <tbody>
          {categories.map((category) => (
            <tr
              key={category.id}
              className="group transition-colors duration-150 hover:bg-surface-alt bg-surface"
            >
              <td className="px-4 py-4 align-middle border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <Package className="w-[18px] h-[18px]" />
                  </div>
                  <span className="font-medium text-text-primary">{category.name}</span>
                </div>
              </td>

              <td className="px-4 py-4 align-middle border-b border-border">
                <code className="text-xs font-medium text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">
                  {category.code}
                </code>
              </td>

              <td className="px-4 py-4 align-middle border-b border-border">
                <span
                  className={category.description ? 'text-text-secondary' : 'text-text-muted'}
                >
                  {category.description || t('category.table.noDescription')}
                </span>
              </td>

              <td className="px-4 py-4 align-middle border-b border-border text-right">
                <span className="inline-flex items-center gap-1.5 text-text-secondary tabular-nums">
                  <Boxes className="w-3.5 h-3.5 text-text-muted" />
                  {category.assetCount}
                </span>
              </td>

              <td className="px-4 py-4 align-middle border-b border-border">
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
                      <DropdownMenuItem onClick={() => onEdit(category)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {tc('actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(category)} className="text-danger">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {tc('actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
