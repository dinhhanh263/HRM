import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatVnd } from '@/lib/utils';
import { useMyPayslips } from '../hooks/usePayslips';
import { PayslipDetailSheet } from './PayslipDetailSheet';

export function MyPayslips() {
  const { t } = useTranslation('payroll');
  const { data, isLoading } = useMyPayslips({ page: 1, limit: 50 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = data?.rows ?? [];

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-background">
        <p className="text-xs text-text-muted">{t('payslip.mine.hint')}</p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Receipt className="size-6 text-text-muted" />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('payslip.mine.empty.title')}</h3>
          <p className="text-sm text-text-muted max-w-xs">{t('payslip.mine.empty.body')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((slip) => (
            <li key={slip.id}>
              <button
                type="button"
                onClick={() => setSelectedId(slip.id)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-alt/50 transition-colors focus-visible:outline-none focus-visible:bg-surface-alt/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Receipt className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">{slip.period}</p>
                    <p className="text-xs text-text-muted">{t('payslip.mine.netLabel')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatVnd(slip.netPay)} ₫
                  </span>
                  <ChevronRight className="size-4 text-text-muted" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PayslipDetailSheet
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        payslipId={selectedId}
      />
    </div>
  );
}
