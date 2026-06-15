import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EmployeeDto, EmployeeListQuery } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Can } from '@/components/auth/Can';
import { EmployeeStatusBadge } from './EmployeeStatusBadge';
import { MoreHorizontal, Eye, Pencil, UserX, UserCheck, LogOut, Users, Plus, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

type SortColumn = NonNullable<EmployeeListQuery['sort']>;

interface EmployeeTableProps {
  employees: EmployeeDto[];
  sort?: EmployeeListQuery['sort'];
  order?: EmployeeListQuery['order'];
  onSort?: (column: SortColumn) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onTerminate: (id: string) => void;
}

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  activeSort?: EmployeeListQuery['sort'];
  order?: EmployeeListQuery['order'];
  onSort?: (column: SortColumn) => void;
  className?: string;
}

function SortableHeader({ label, column, activeSort, order, onSort, className }: SortableHeaderProps) {
  const isActive = activeSort === column;
  const ariaSort = isActive ? (order === 'desc' ? 'descending' : 'ascending') : 'none';
  const Icon = isActive ? (order === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <th
      aria-sort={ariaSort}
      className={cn(
        'px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort?.(column)}
        className="flex items-center gap-1 uppercase tracking-wider hover:text-primary transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
      >
        {label}
        <Icon className={cn('size-3 transition-opacity', isActive ? 'opacity-100 text-primary' : 'opacity-40')} />
      </button>
    </th>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('vi-VN');
}

export function EmployeeTable({
  employees,
  sort,
  order,
  onSort,
  onActivate,
  onDeactivate,
  onTerminate,
}: EmployeeTableProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('employee');

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">{t('table.empty.title')}</p>
        <Can
          permission="employees:create"
          fallback={<p className="text-text-muted text-sm mt-2">{t('table.empty.subtitleReadonly')}</p>}
        >
          <p className="text-text-muted text-sm mt-2">{t('table.empty.subtitle')}</p>
          <Button className="mt-4" size="sm" onClick={() => navigate('/employees/new')}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t('table.empty.cta')}
          </Button>
        </Can>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {/* Table Header */}
        <thead className="bg-border border-b-2 border-border-strong">
          <tr>
            <SortableHeader
              label={t('table.columns.employee')}
              column="fullName"
              activeSort={sort}
              order={order}
              onSort={onSort}
              className="w-[280px]"
            />
            <SortableHeader
              label={t('table.columns.employeeCode')}
              column="employeeCode"
              activeSort={sort}
              order={order}
              onSort={onSort}
              className="w-[120px]"
            />
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider">
              {t('table.columns.department')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider">
              {t('table.columns.position')}
            </th>
            <SortableHeader
              label={t('table.columns.joinDate')}
              column="joinDate"
              activeSort={sort}
              order={order}
              onSort={onSort}
              className="w-[110px]"
            />
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[130px]">
              {t('table.columns.status')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[60px]" />
          </tr>
        </thead>

        {/* Table Body */}
        <tbody>
          {employees.map((employee) => (
            <tr
              key={employee.id}
              className="group cursor-pointer transition-colors duration-150 hover:bg-surface-alt bg-surface"
              onClick={() => navigate(`/employees/${employee.id}`)}
            >
              {/* Employee Info */}
              <td className="px-4 py-4 align-middle text-text-primary border-b border-border">
                <div className="flex items-center gap-3">
                  {employee.avatar ? (
                    <img
                      src={employee.avatar}
                      alt={employee.fullName}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                      {getInitials(employee.fullName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                      {employee.fullName}
                    </div>
                    <div className="text-sm text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                      {employee.user?.email || '—'}
                    </div>
                  </div>
                </div>
              </td>

              {/* Employee Code */}
              <td className="px-4 py-4 align-middle text-text-primary border-b border-border whitespace-nowrap">
                <span className="inline-block font-mono text-sm tabular-nums text-text-secondary bg-surface-alt px-2 py-1 rounded whitespace-nowrap">
                  {employee.employeeCode}
                </span>
              </td>

              {/* Department */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <span className={employee.department?.name ? 'text-text-primary' : 'text-text-muted'}>
                  {employee.department?.name || '—'}
                </span>
              </td>

              {/* Position */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <span className={employee.position?.name ? 'text-text-primary' : 'text-text-muted'}>
                  {employee.position?.name || '—'}
                </span>
              </td>

              {/* Join Date */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <span className="text-text-secondary text-sm tabular-nums">
                  {formatDate(employee.joinDate)}
                </span>
              </td>

              {/* Status */}
              <td className="px-4 py-4 align-middle border-b border-border">
                <EmployeeStatusBadge status={employee.status} />
              </td>

              {/* Actions */}
              <td
                className="px-4 py-4 align-middle border-b border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                      <MoreHorizontal className="w-[18px] h-[18px]" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[180px]">
                    <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}`)}>
                      <Eye className="w-4 h-4 mr-2" />
                      {t('table.actions.viewDetail')}
                    </DropdownMenuItem>
                    <Can permission="employees:update">
                      <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}/edit`)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t('table.actions.edit')}
                      </DropdownMenuItem>
                    </Can>
                    <DropdownMenuSeparator />
                    {employee.status === 'INACTIVE' && (
                      <Can permission="employees:activate">
                        <DropdownMenuItem onClick={() => onActivate(employee.id)}>
                          <UserCheck className="w-4 h-4 mr-2 text-success" />
                          {t('table.actions.activate')}
                        </DropdownMenuItem>
                      </Can>
                    )}
                    {employee.status === 'ACTIVE' && (
                      <Can permission="employees:deactivate">
                        <DropdownMenuItem onClick={() => onDeactivate(employee.id)}>
                          <UserX className="w-4 h-4 mr-2 text-warning" />
                          {t('table.actions.deactivate')}
                        </DropdownMenuItem>
                      </Can>
                    )}
                    {employee.status !== 'TERMINATED' && (
                      <Can permission="employees:terminate">
                        <DropdownMenuItem onClick={() => onTerminate(employee.id)} className="text-danger">
                          <LogOut className="w-4 h-4 mr-2" />
                          {t('table.actions.terminate')}
                        </DropdownMenuItem>
                      </Can>
                    )}
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
