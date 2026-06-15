import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, History, Wallet } from 'lucide-react';
import type { PayrollEmployeeDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { cn, formatVnd, getInitials } from '@/lib/utils';
import { useSalaryRoster } from '../hooks/useSalaries';
import { SalaryFormSheet } from './SalaryFormSheet';
import { SalaryHistorySheet } from './SalaryHistorySheet';

const ALL_DEPARTMENTS = '__all__';

export function SalarySheet() {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  const canManage = can('payroll:process');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(ALL_DEPARTMENTS);

  const [formEmployee, setFormEmployee] = useState<PayrollEmployeeDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState<PayrollEmployeeDto | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data: departments } = useDepartments();
  const { data: roster, isLoading } = useSalaryRoster({
    search: debouncedSearch || undefined,
    departmentId: departmentId === ALL_DEPARTMENTS ? undefined : departmentId,
  });

  function openSetSalary(employee: PayrollEmployeeDto) {
    setFormEmployee(employee);
    setFormOpen(true);
  }

  function openHistory(employee: PayrollEmployeeDto) {
    setHistoryEmployee(employee);
    setHistoryOpen(true);
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            <Input
              className="pl-8 h-8 w-64 text-xs"
              placeholder={t('salary.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder={t('salary.allDepartments')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DEPARTMENTS}>{t('salary.allDepartments')}</SelectItem>
              {(departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 w-1/4 rounded" />
              <Skeleton className="h-3.5 w-24 rounded ml-auto" />
            </div>
          ))}
        </div>
      ) : !roster || roster.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Wallet className="size-6 text-text-muted" />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('salary.empty.title')}</h3>
          <p className="text-sm text-text-muted max-w-xs">{t('salary.empty.body')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-alt hover:bg-surface-alt">
              <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('salary.columns.employee')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('salary.columns.department')}
              </TableHead>
              <TableHead className="text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('salary.columns.baseSalary')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('salary.columns.effectiveFrom')}
              </TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map(({ employee, salary }) => (
              <TableRow key={employee.id} className="group h-14 hover:bg-surface-alt/50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={employee.avatar ?? undefined} alt={employee.fullName} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                        {getInitials(employee.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {employee.fullName}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{employee.employeeCode}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {employee.departmentName ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  {salary ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {formatVnd(salary.baseSalary)} ₫
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {t('salary.notSet')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-text-secondary tabular-nums">
                  {salary?.effectiveFrom ?? '—'}
                </TableCell>
                <TableCell>
                  <div
                    className={cn(
                      'flex items-center justify-end gap-1',
                      'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={t('salary.actions.history')}
                      onClick={() => openHistory(employee)}
                    >
                      <History className="size-3.5" />
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('salary.actions.setSalary')}
                        onClick={() => openSetSalary(employee)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SalaryFormSheet open={formOpen} onOpenChange={setFormOpen} employee={formEmployee} />
      <SalaryHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        employee={historyEmployee}
      />
    </div>
  );
}
