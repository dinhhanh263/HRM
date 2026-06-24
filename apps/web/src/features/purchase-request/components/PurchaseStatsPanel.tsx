import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseRequestStatus, PurchaseStatsGroup } from '@hrm/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatVnd, cn } from '@/lib/utils';
import { AlertTriangle, ShoppingCart, CheckCircle2, Clock, ListChecks } from 'lucide-react';
import { PurchaseStatusBadge } from './PurchaseStatusBadge';
import { usePurchaseStats } from '../hooks/usePurchaseRequests';

const MONTH_KEYS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  tone: 'primary' | 'green' | 'amber' | 'muted';
}) {
  const toneCls = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    muted: 'bg-surface-alt text-text-secondary',
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', toneCls)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-text-primary">{value}</p>
    </div>
  );
}

function BreakdownList({ title, groups, renderKey }: {
  title: string;
  groups: PurchaseStatsGroup[];
  renderKey: (g: PurchaseStatsGroup) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-text-primary mb-3">{title}</p>
      <ul className="space-y-2">
        {groups.length === 0 && <li className="text-sm text-text-muted">—</li>}
        {groups.map((g) => (
          <li key={g.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
              {renderKey(g)}
              <span className="text-text-muted shrink-0">({g.count})</span>
            </span>
            <span className="font-medium tabular-nums text-text-primary shrink-0">{formatVnd(g.total)} ₫</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PurchaseStatsPanel() {
  const { t } = useTranslation('purchase');
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const { data, isLoading, isError } = usePurchaseStats(year);

  const maxMonth = data ? Math.max(1, ...data.months.map((m) => Number(m.total))) : 1;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">{t('stats.year')}</span>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-56 rounded-lg" />
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="size-8 text-danger mb-2" />
          <p className="text-sm text-text-secondary">{t('table.loadError')}</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard icon={ShoppingCart} tone="primary" label={t('stats.grandTotal')} value={`${formatVnd(data.grandTotal)} ₫`} />
            <KpiCard icon={CheckCircle2} tone="green" label={t('stats.orderedTotal')} value={`${formatVnd(data.orderedTotal)} ₫`} />
            <KpiCard icon={Clock} tone="amber" label={t('stats.pendingTotal')} value={`${formatVnd(data.pendingTotal)} ₫`} />
            <KpiCard icon={ListChecks} tone="muted" label={t('stats.count')} value={String(data.grandCount)} />
          </div>

          {/* Monthly bar chart */}
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-sm font-semibold text-text-primary mb-4">{t('stats.monthlyTitle')}</p>
            <div className="flex gap-1.5 h-48" role="img" aria-label={t('stats.monthlyTitle')}>
              {data.months.map((m) => {
                const val = Number(m.total);
                const pct = Math.max(val > 0 ? 2 : 0, Math.round((val / maxMonth) * 100));
                return (
                  <div key={m.month} className="flex-1 h-full flex flex-col items-center gap-1.5 group">
                    <div className="relative w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t bg-primary/80 hover:bg-primary transition-colors"
                        style={{ height: `${pct}%` }}
                        title={`${MONTH_KEYS[m.month - 1]}: ${formatVnd(m.total)} ₫ (${m.count})`}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted tabular-nums">{MONTH_KEYS[m.month - 1]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Breakdown by status */}
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownList
              title={t('stats.byStatus')}
              groups={data.byStatus}
              renderKey={(g) => <PurchaseStatusBadge status={g.key as PurchaseRequestStatus} />}
            />
            <BreakdownList
              title={t('stats.byDepartment')}
              groups={data.byDepartment}
              renderKey={(g) => <span className="truncate text-text-secondary">{g.key || t('stats.noDepartment')}</span>}
            />
          </div>

          {/* Breakdown by vendor */}
          <BreakdownList
            title={t('stats.byVendor')}
            groups={data.byVendor}
            renderKey={(g) => <span className="truncate text-text-secondary">{g.key}</span>}
          />
        </>
      )}
    </div>
  );
}
