import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { PayrollEmployeeDto } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import { cn, formatVnd } from '@/lib/utils';
import { useEmployeeSalaries, useDeleteSalary } from '../hooks/useSalaries';

interface SalaryHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: PayrollEmployeeDto | null;
}

export function SalaryHistorySheet({ open, onOpenChange, employee }: SalaryHistorySheetProps) {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  const canManage = can('payroll:process');
  const { data: history, isLoading } = useEmployeeSalaries(open ? employee?.id ?? null : null);
  const deleteMutation = useDeleteSalary();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function confirmDelete() {
    if (!confirmId) return;
    deleteMutation.mutate(confirmId, {
      onSuccess: () => {
        toast.success(t('salary.history.toast.removed'));
        setConfirmId(null);
      },
      onError: () => {
        toast.error(t('salary.history.toast.error'), {
          description: t('salary.history.toast.headOnly'),
        });
        setConfirmId(null);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t('salary.history.title')}</SheetTitle>
          <SheetDescription>
            {employee
              ? t('salary.history.subtitle', {
                  name: employee.fullName,
                  code: employee.employeeCode,
                })
              : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">{t('salary.history.empty')}</p>
          ) : (
            <ol className="space-y-2">
              {history.map((rec, i) => {
                const isHead = i === 0;
                const allowanceTotal = rec.allowances.reduce((s, a) => s + a.amount, 0);
                return (
                  <li
                    key={rec.id}
                    className={cn(
                      'rounded-lg border p-3',
                      isHead && rec.effectiveTo === null
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-surface',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatVnd(rec.baseSalary)} ₫
                          </span>
                          {isHead && rec.effectiveTo === null && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {t('salary.history.current')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 tabular-nums">
                          {rec.effectiveFrom} →{' '}
                          {rec.effectiveTo ?? t('salary.history.ongoing')}
                        </p>
                        {allowanceTotal > 0 && (
                          <p className="text-xs text-text-secondary mt-1">
                            {t('salary.history.allowanceTotal')}:{' '}
                            <span className="tabular-nums">{formatVnd(allowanceTotal)} ₫</span>
                          </p>
                        )}
                        {rec.note && (
                          <p className="text-xs text-text-muted mt-1 truncate">{rec.note}</p>
                        )}
                      </div>
                      {canManage && isHead && (
                        <button
                          type="button"
                          aria-label={t('salary.history.remove')}
                          onClick={() => setConfirmId(rec.id)}
                          className="size-7 shrink-0 flex items-center justify-center rounded-md text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('salary.history.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('salary.history.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger hover:bg-danger/90"
              disabled={deleteMutation.isPending}
              onClick={confirmDelete}
            >
              {t('salary.history.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
