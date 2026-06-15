import { useTranslation } from 'react-i18next';
import type { DepartmentDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Building2, Plus, Users } from 'lucide-react';

interface DepartmentTableProps {
  departments: DepartmentDto[];
  onCreate: () => void;
  onEdit: (department: DepartmentDto) => void;
  onDelete: (department: DepartmentDto) => void;
}

export function DepartmentTable({ departments, onCreate, onEdit, onDelete }: DepartmentTableProps) {
  const { t } = useTranslation('department');
  const { t: tc } = useTranslation('common');

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">{t('empty.title')}</p>
        <p className="text-text-muted text-sm mt-2">{t('empty.description')}</p>
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('form.create')}
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
              {t('table.name')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider">
              {t('table.description')}
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[140px]">
              {t('table.employeeColumn')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[60px]" />
          </tr>
        </thead>

        <tbody>
          {departments.map((department) => (
            <tr
              key={department.id}
              className="group transition-colors duration-150 hover:bg-surface-alt bg-surface"
            >
              {/* Name */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                    <Building2 className="w-[18px] h-[18px]" />
                  </div>
                  <span className="font-medium text-text-primary">{department.name}</span>
                </div>
              </td>

              {/* Description */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <span className={department.description ? 'text-text-secondary' : 'text-text-muted'}>
                  {department.description || t('table.noDescription')}
                </span>
              </td>

              {/* Employee count */}
              <td className="px-4 py-4 align-middle border-b border-border text-right">
                <span className="inline-flex items-center gap-1.5 text-text-secondary tabular-nums">
                  <Users className="w-3.5 h-3.5 text-text-muted" />
                  {department.employeeCount}
                </span>
              </td>

              {/* Actions */}
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
                      <DropdownMenuItem onClick={() => onEdit(department)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {tc('actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(department)}
                        className="text-danger"
                      >
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
