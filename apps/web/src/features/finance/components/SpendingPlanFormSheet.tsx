import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpendingPlanDto, SpendingPlanItemInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatVnd, groupThousands } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import { useIssuingEntitiesLite } from '../hooks/useFundAccounts';
import { useFinanceCategories } from '../hooks/useFinanceCategories';
import { useDepartments } from '@/features/departments/hooks/useDepartments';

export interface SpendingPlanFormData {
  departmentId: string | null;
  issuingEntityId: string;
  period: string;
  items: SpendingPlanItemInput[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: SpendingPlanDto | null;
  onSubmit: (data: SpendingPlanFormData) => void;
  isLoading?: boolean;
}

interface Row {
  title: string;
  amount: string; // grouped
  categoryId: string;
  expectedDate: string;
}

const NONE = '__none__';
const nextMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
};
const emptyRow = (): Row => ({ title: '', amount: '', categoryId: NONE, expectedDate: '' });

export function SpendingPlanFormSheet({ open, onOpenChange, plan, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const isEditing = !!plan;

  const { data: departments = [] } = useDepartments();
  const { data: entities = [] } = useIssuingEntitiesLite();
  const { data: categories = [] } = useFinanceCategories({ active: true });
  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');

  const [departmentId, setDepartmentId] = useState(NONE);
  const [entityId, setEntityId] = useState('');
  const [period, setPeriod] = useState(nextMonth());
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  useEffect(() => {
    if (open) {
      setDepartmentId(plan?.departmentId ?? NONE);
      setEntityId(plan?.issuingEntityId ?? '');
      setPeriod(plan?.period ?? nextMonth());
      setRows(
        plan && plan.items.length
          ? plan.items.map((i) => ({
              title: i.title,
              amount: groupThousands(i.amount),
              categoryId: i.categoryId ?? NONE,
              expectedDate: i.expectedDate ? i.expectedDate.slice(0, 10) : '',
            }))
          : [emptyRow()],
      );
    }
  }, [open, plan]);

  const total = rows.reduce((s, r) => s + (Number(r.amount.replace(/\D/g, '')) || 0), 0);

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleSubmit() {
    const items: SpendingPlanItemInput[] = rows
      .filter((r) => r.title.trim() && Number(r.amount.replace(/\D/g, '')) > 0)
      .map((r) => ({
        title: r.title.trim(),
        amount: Number(r.amount.replace(/\D/g, '')),
        categoryId: r.categoryId === NONE ? null : r.categoryId,
        expectedDate: r.expectedDate || null,
      }));
    if (!entityId || items.length === 0) return;
    onSubmit({ departmentId: departmentId === NONE ? null : departmentId, issuingEntityId: entityId, period, items });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('plans.form.edit') : t('plans.form.create')}</SheetTitle>
          <SheetDescription>{t('plans.form.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('plans.form.department')}</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={isEditing}>
                <SelectTrigger><SelectValue placeholder={t('plans.form.departmentPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('plans.form.noDepartment')}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('plans.form.period')} <span className="text-danger">*</span></Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={isEditing} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('plans.form.entity')} <span className="text-danger">*</span></Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={isEditing}>
              <SelectTrigger><SelectValue placeholder={t('plans.form.entityPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditing && <p className="text-xs text-text-muted">{t('plans.form.lockedHint')}</p>}
          </div>

          {/* Item editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('plans.form.items')} <span className="text-danger">*</span></Label>
              <span className="text-sm text-text-muted">
                {t('plans.form.total')}: <span className="font-semibold text-text-primary tabular-nums">{formatVnd(total)}</span>
              </span>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('plans.form.itemTitle')}
                    value={row.title}
                    onChange={(e) => setRow(idx, { title: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 text-danger shrink-0"
                    onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                    aria-label={tc('actions.delete')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex">
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      className="rounded-r-none tabular-nums"
                      value={row.amount}
                      onChange={(e) => setRow(idx, { amount: groupThousands(e.target.value) })}
                    />
                    <span className="flex items-center px-2 border border-l-0 rounded-r-md bg-surface-alt text-text-muted text-xs">₫</span>
                  </div>
                  <Select value={row.categoryId} onValueChange={(v) => setRow(idx, { categoryId: v })}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder={t('plans.form.category')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('plans.form.noCategory')}</SelectItem>
                      {expenseCats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={row.expectedDate} onChange={(e) => setRow(idx, { expectedDate: e.target.value })} className="text-xs" />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              <Plus className="size-4 mr-1.5" />
              {t('plans.form.addItem')}
            </Button>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading || !departmentId || !entityId}>
            {isLoading ? tc('states.saving') : isEditing ? tc('actions.saveChanges') : t('plans.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
