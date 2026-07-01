import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CashTransactionDto,
  TransactionDirection,
  TransactionStatus,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { groupThousands } from '@/lib/utils';
import { useFundAccounts } from '../hooks/useFundAccounts';
import { useFinanceCategories } from '../hooks/useFinanceCategories';
import { useDepartments } from '@/features/departments/hooks/useDepartments';

export interface CashTransactionFormData {
  accountId: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount: number;
  occurredAt: string;
  categoryId: string | null;
  departmentId: string | null;
  description: string | null;
  reference: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: CashTransactionDto | null;
  onSubmit: (data: CashTransactionFormData) => void;
  isLoading?: boolean;
}

const NONE = '__none__';
const today = () => new Date().toISOString().slice(0, 10);

export function CashTransactionFormSheet({ open, onOpenChange, transaction, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const isEditing = !!transaction;

  const { data: accounts = [] } = useFundAccounts({ active: true });
  const { data: categories = [] } = useFinanceCategories({ active: true });
  const { data: departments = [] } = useDepartments();

  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState<TransactionDirection>('OUT');
  const [status, setStatus] = useState<TransactionStatus>('ACTUAL');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [departmentId, setDepartmentId] = useState<string>(NONE);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (open) {
      setAccountId(transaction?.accountId ?? '');
      setDirection(transaction?.direction ?? 'OUT');
      setStatus(transaction?.status ?? 'ACTUAL');
      setAmount(transaction ? groupThousands(transaction.amount) : '');
      setOccurredAt(transaction ? transaction.occurredAt.slice(0, 10) : today());
      setCategoryId(transaction?.categoryId ?? NONE);
      setDepartmentId(transaction?.departmentId ?? NONE);
      setDescription(transaction?.description ?? '');
      setReference(transaction?.reference ?? '');
    }
  }, [open, transaction]);

  // Categories are kind-scoped: IN → INCOME, OUT → EXPENSE.
  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === (direction === 'IN' ? 'INCOME' : 'EXPENSE')),
    [categories, direction],
  );

  function handleSubmit() {
    const numericAmount = Number(amount.replace(/\D/g, ''));
    if (!accountId || numericAmount <= 0 || !occurredAt) return;
    onSubmit({
      accountId,
      direction,
      status,
      amount: numericAmount,
      occurredAt,
      categoryId: categoryId === NONE ? null : categoryId,
      departmentId: departmentId === NONE ? null : departmentId,
      description: description.trim() || null,
      reference: reference.trim() || null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('transactions.form.edit') : t('transactions.form.create')}</SheetTitle>
          <SheetDescription>{t('transactions.form.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          {/* Direction segmented control */}
          <div className="grid grid-cols-2 gap-2">
            {(['OUT', 'IN'] as TransactionDirection[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDirection(d);
                  setCategoryId(NONE);
                }}
                className={cn(
                  'h-10 rounded-md border text-sm font-medium transition-colors',
                  direction === d
                    ? d === 'IN'
                      ? 'border-success bg-success-light text-success'
                      : 'border-warning bg-warning-light text-warning'
                    : 'border-border text-text-secondary hover:bg-surface-alt',
                )}
              >
                {t(`transactions.direction.${d}`)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-account">
              {t('transactions.form.accountLabel')} <span className="text-danger">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="ct-account">
                <SelectValue placeholder={t('transactions.form.accountPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.issuingEntityName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct-amount">
                {t('transactions.form.amountLabel')} <span className="text-danger">*</span>
              </Label>
              <div className="flex">
                <Input
                  id="ct-amount"
                  inputMode="numeric"
                  className="rounded-r-none tabular-nums"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(groupThousands(e.target.value))}
                />
                <span className="flex items-center px-3 border border-l-0 rounded-r-md bg-surface-alt text-text-muted text-sm">
                  VND
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-date">
                {t('transactions.form.dateLabel')} <span className="text-danger">*</span>
              </Label>
              <Input id="ct-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-category">{t('transactions.form.categoryLabel')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="ct-category">
                <SelectValue placeholder={t('transactions.form.categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('transactions.form.noCategory')}</SelectItem>
                {kindCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-department">{t('transactions.form.departmentLabel')}</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="ct-department">
                <SelectValue placeholder={t('transactions.form.departmentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('transactions.form.noDepartment')}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-status">{t('transactions.form.statusLabel')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TransactionStatus)}>
              <SelectTrigger id="ct-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTUAL">{t('transactions.status.ACTUAL')}</SelectItem>
                <SelectItem value="PLANNED">{t('transactions.status.PLANNED')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">{t('transactions.form.statusHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-reference">{t('transactions.form.referenceLabel')}</Label>
            <Input id="ct-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('transactions.form.referencePlaceholder')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-description">{t('transactions.form.descriptionLabel')}</Label>
            <Textarea id="ct-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('transactions.form.descriptionPlaceholder')} />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading || !accountId}>
            {isLoading ? tc('states.saving') : isEditing ? tc('actions.saveChanges') : t('transactions.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
