import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import type { InsuranceBase, TaxBracket, UpdatePayrollSettingsRequest } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import { cn, groupThousands } from '@/lib/utils';
import { usePayrollSettings, useUpdatePayrollSettings } from '../hooks/usePayrollSettings';

interface FormState {
  payDay: number;
  socialInsuranceRate: number;
  healthInsuranceRate: number;
  unemploymentInsuranceRate: number;
  unionFeeRate: number;
  insuranceBase: InsuranceBase;
  insuranceCap: string;
  personalDeduction: string;
  dependentDeduction: string;
  taxBrackets: TaxBracket[];
}

// Insurance/PIT fractions are persisted as decimals (0.08) but edited as percent
// (8) for human legibility; convert at the form boundary.
const toPct = (frac: number) => Number((frac * 100).toFixed(2));
const toFrac = (pct: number) => Number((pct / 100).toFixed(6));

export function PayrollSettings() {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  const canConfigure = can('payroll:process');
  const { data: settings, isLoading } = usePayrollSettings();
  const updateMutation = useUpdatePayrollSettings();

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        payDay: settings.payDay,
        socialInsuranceRate: settings.socialInsuranceRate,
        healthInsuranceRate: settings.healthInsuranceRate,
        unemploymentInsuranceRate: settings.unemploymentInsuranceRate,
        unionFeeRate: settings.unionFeeRate,
        insuranceBase: settings.insuranceBase,
        insuranceCap: settings.insuranceCap ?? '',
        personalDeduction: settings.personalDeduction,
        dependentDeduction: settings.dependentDeduction,
        taxBrackets: settings.taxBrackets,
      });
    }
  }, [settings]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setBracket(i: number, patch: Partial<TaxBracket>) {
    setForm((f) =>
      f ? { ...f, taxBrackets: f.taxBrackets.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) } : f,
    );
  }

  function addBracket() {
    setForm((f) => {
      if (!f) return f;
      const rows = [...f.taxBrackets];
      const last = rows[rows.length - 1];
      // Insert a new bounded row before the open-ended top bracket.
      const newRow: TaxBracket = { upTo: last?.upTo ?? 1_000_000, rate: 0.05 };
      if (last && last.upTo === null) {
        rows.splice(rows.length - 1, 0, { upTo: 1_000_000, rate: 0.05 });
      } else {
        rows.push(newRow);
      }
      return { ...f, taxBrackets: rows };
    });
  }

  function removeBracket(i: number) {
    setForm((f) => (f ? { ...f, taxBrackets: f.taxBrackets.filter((_, idx) => idx !== i) } : f));
  }

  function submit() {
    if (!form) return;
    const payload: UpdatePayrollSettingsRequest = {
      payDay: form.payDay,
      socialInsuranceRate: form.socialInsuranceRate,
      healthInsuranceRate: form.healthInsuranceRate,
      unemploymentInsuranceRate: form.unemploymentInsuranceRate,
      unionFeeRate: form.unionFeeRate,
      insuranceBase: form.insuranceBase,
      insuranceCap: form.insuranceCap.trim() === '' ? null : form.insuranceCap.trim(),
      personalDeduction: form.personalDeduction,
      dependentDeduction: form.dependentDeduction,
      taxBrackets: form.taxBrackets,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => toast.success(t('settings.toast.saved')),
      onError: () => toast.error(t('settings.toast.saveError'), { description: t('settings.toast.tryAgain') }),
    });
  }

  if (isLoading || !form) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 space-y-4 shadow-sm">
        <Skeleton className="h-4 w-1/3 rounded" />
        <Skeleton className="h-9 w-full rounded" />
        <Skeleton className="h-9 w-2/3 rounded" />
      </div>
    );
  }

  const rateFields = [
    ['socialInsuranceRate', 'settings.fields.socialInsuranceRate'],
    ['healthInsuranceRate', 'settings.fields.healthInsuranceRate'],
    ['unemploymentInsuranceRate', 'settings.fields.unemploymentInsuranceRate'],
    ['unionFeeRate', 'settings.fields.unionFeeRate'],
  ] as const;

  // Money inputs are shown grouped (10,000,000) but stored as a digits-only
  // string on the wire. Strip separators on the way in.
  const onMoneyChange = (key: 'insuranceCap' | 'personalDeduction' | 'dependentDeduction') =>
    (e: ChangeEvent<HTMLInputElement>) => set(key, e.target.value.replace(/\D/g, ''));

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('settings.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('settings.subtitle')}</p>
        </div>
        {canConfigure && (
          <Button size="sm" className="h-8 text-xs gap-1.5" disabled={updateMutation.isPending} onClick={submit}>
            {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {t('actions.save', { ns: 'common' })}
          </Button>
        )}
      </div>

      <div className="p-5 space-y-6">
        {/* Insurance rates */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('settings.insuranceRates')}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rateFields.map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`pr-${key}`} className="text-xs font-medium text-text-secondary">
                  {t(label)}
                </Label>
                <div className="flex">
                  <Input
                    id={`pr-${key}`}
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    className="h-9 text-sm tabular-nums rounded-r-none"
                    disabled={!canConfigure}
                    value={toPct(form[key])}
                    onChange={(e) => set(key, toFrac(Number(e.target.value)))}
                  />
                  <span className="flex items-center px-3 border border-l-0 border-border rounded-r-md bg-surface-alt text-text-muted text-sm">
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insurance base + cap + payday */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary">{t('settings.fields.insuranceBase')}</Label>
            <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt p-0.5 h-9">
              {(['BASE_SALARY', 'GROSS'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!canConfigure}
                  onClick={() => set('insuranceBase', opt)}
                  aria-pressed={form.insuranceBase === opt}
                  className={cn(
                    'flex-1 h-8 rounded text-xs font-medium transition-colors',
                    form.insuranceBase === opt
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {t(`settings.insuranceBaseOption.${opt}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-cap" className="text-xs font-medium text-text-secondary">
              {t('settings.fields.insuranceCap')}
            </Label>
            <Input
              id="pr-cap"
              type="text"
              inputMode="numeric"
              placeholder={t('settings.uncapped')}
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              value={groupThousands(form.insuranceCap)}
              onChange={onMoneyChange('insuranceCap')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-payday" className="text-xs font-medium text-text-secondary">
              {t('settings.fields.payDay')}
            </Label>
            <Input
              id="pr-payday"
              type="number"
              min={1}
              max={31}
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              value={form.payDay}
              onChange={(e) => set('payDay', Number(e.target.value))}
            />
          </div>
        </div>

        {/* Deductions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pr-personal" className="text-xs font-medium text-text-secondary">
              {t('settings.fields.personalDeduction')}
            </Label>
            <Input
              id="pr-personal"
              type="text"
              inputMode="numeric"
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              value={groupThousands(form.personalDeduction)}
              onChange={onMoneyChange('personalDeduction')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-dependent" className="text-xs font-medium text-text-secondary">
              {t('settings.fields.dependentDeduction')}
            </Label>
            <Input
              id="pr-dependent"
              type="text"
              inputMode="numeric"
              className="h-9 text-sm tabular-nums"
              disabled={!canConfigure}
              value={groupThousands(form.dependentDeduction)}
              onChange={onMoneyChange('dependentDeduction')}
            />
          </div>
        </div>

        {/* Tax brackets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t('settings.taxBrackets')}</Label>
            {canConfigure && (
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={addBracket}>
                <Plus className="size-3" />
                {t('settings.addBracket')}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-text-muted">{t('settings.taxBracketsHint')}</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 bg-surface-alt text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              <span>{t('settings.bracket.upTo')}</span>
              <span>{t('settings.bracket.rate')}</span>
              <span className="w-7" />
            </div>
            {form.taxBrackets.map((b, i) => {
              const isTop = b.upTo === null;
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 border-t border-border items-center">
                  {isTop ? (
                    <span className="text-sm text-text-muted">{t('settings.bracket.andAbove')}</span>
                  ) : (
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-8 text-sm tabular-nums"
                      disabled={!canConfigure}
                      value={groupThousands(b.upTo == null ? '' : String(b.upTo))}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setBracket(i, { upTo: digits === '' ? 0 : Number(digits) });
                      }}
                    />
                  )}
                  <div className="flex">
                    <Input
                      type="number"
                      step="0.5"
                      min={0}
                      max={100}
                      className="h-8 text-sm tabular-nums rounded-r-none"
                      disabled={!canConfigure}
                      value={toPct(b.rate)}
                      onChange={(e) => setBracket(i, { rate: toFrac(Number(e.target.value)) })}
                    />
                    <span className="flex items-center px-2 border border-l-0 border-border rounded-r-md bg-surface-alt text-text-muted text-xs">
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('settings.removeBracket')}
                    disabled={!canConfigure || isTop}
                    onClick={() => removeBracket(i)}
                    className="size-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
