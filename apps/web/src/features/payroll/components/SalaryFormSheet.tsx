import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { AllowanceItem, CreateEmployeeSalaryRequest, PayrollEmployeeDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useCreateSalary } from '../hooks/useSalaries';

interface SalaryFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: PayrollEmployeeDto | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function SalaryFormSheet({ open, onOpenChange, employee }: SalaryFormSheetProps) {
  const { t } = useTranslation('payroll');
  const { t: tc } = useTranslation('common');
  const createMutation = useCreateSalary();

  const [baseSalary, setBaseSalary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [note, setNote] = useState('');
  const [allowances, setAllowances] = useState<AllowanceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBaseSalary('');
      setEffectiveFrom(todayIso());
      setNote('');
      setAllowances([]);
      setError(null);
    }
  }, [open]);

  function setAllowance(i: number, patch: Partial<AllowanceItem>) {
    setAllowances((rows) => rows.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function addAllowance() {
    setAllowances((rows) => [...rows, { name: '', amount: 0, taxable: true }]);
  }

  function removeAllowance(i: number) {
    setAllowances((rows) => rows.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (!employee) return;
    setError(null);

    const baseNum = Number(baseSalary);
    if (baseSalary.trim() === '' || !Number.isFinite(baseNum) || baseNum < 0) {
      setError(t('salary.form.errors.baseSalary'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError(t('salary.form.errors.effectiveFrom'));
      return;
    }
    for (const a of allowances) {
      if (a.name.trim() === '') {
        setError(t('salary.form.errors.allowanceName'));
        return;
      }
      if (!Number.isFinite(a.amount) || a.amount < 0) {
        setError(t('salary.form.errors.allowanceAmount'));
        return;
      }
    }

    const payload: CreateEmployeeSalaryRequest = {
      employeeId: employee.id,
      baseSalary: String(Math.round(baseNum)),
      effectiveFrom,
      allowances: allowances.map((a) => ({
        name: a.name.trim(),
        amount: Math.round(a.amount),
        taxable: a.taxable,
      })),
      note: note.trim() === '' ? undefined : note.trim(),
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(t('salary.form.toast.saved'));
        onOpenChange(false);
      },
      onError: () =>
        toast.error(t('salary.form.toast.error'), { description: t('salary.form.toast.tryAgain') }),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t('salary.form.title')}</SheetTitle>
          <SheetDescription>
            {employee
              ? t('salary.form.subtitle', {
                  name: employee.fullName,
                  code: employee.employeeCode,
                })
              : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sf-base">
                {t('salary.form.baseSalary')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="sf-base"
                type="number"
                min={0}
                placeholder="0"
                className="h-9 text-sm tabular-nums"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-from">
                {t('salary.form.effectiveFrom')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="sf-from"
                type="date"
                className="h-9 text-sm"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>

          {/* Allowances */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('salary.form.allowances')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={addAllowance}
              >
                <Plus className="size-3" />
                {t('salary.form.addAllowance')}
              </Button>
            </div>
            {allowances.length === 0 ? (
              <p className="text-[11px] text-text-muted">{t('salary.form.noAllowances')}</p>
            ) : (
              <div className="space-y-2">
                {allowances.map((a, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center"
                  >
                    <Input
                      placeholder={t('salary.form.allowanceName')}
                      className="h-8 text-sm"
                      value={a.name}
                      onChange={(e) => setAllowance(i, { name: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="h-8 text-sm tabular-nums"
                      value={a.amount === 0 ? '' : a.amount}
                      onChange={(e) => setAllowance(i, { amount: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      onClick={() => setAllowance(i, { taxable: !a.taxable })}
                      aria-pressed={a.taxable}
                      className={cn(
                        'h-8 px-2.5 rounded-md text-xs font-medium border transition-colors',
                        a.taxable
                          ? 'border-border bg-surface-alt text-text-secondary'
                          : 'border-border bg-surface text-text-muted',
                      )}
                    >
                      {a.taxable ? t('salary.form.taxable') : t('salary.form.nonTaxable')}
                    </button>
                    <button
                      type="button"
                      aria-label={t('salary.form.removeAllowance')}
                      onClick={() => removeAllowance(i)}
                      className="size-8 flex items-center justify-center rounded-md text-text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-note">{t('salary.form.note')}</Label>
            <Textarea
              id="sf-note"
              placeholder={t('salary.form.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" disabled={createMutation.isPending} onClick={submit}>
            {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('salary.form.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
