import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatVnd } from '@/lib/utils';
import { Wallet, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIssuingEntitiesLite } from '../hooks/useFundAccounts';
import { useFinanceDashboard } from '../hooks/useFinanceDashboard';

const ALL = '__all__';
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function FinanceDashboardPage() {
  const { t } = useTranslation('finance');
  const [entityId, setEntityId] = useState(ALL);
  const [month, setMonth] = useState(currentMonth());

  const { data: entities = [] } = useIssuingEntitiesLite();
  const { data, isLoading } = useFinanceDashboard({
    issuingEntityId: entityId === ALL ? undefined : entityId,
    month,
  });

  const chartData = (data?.series ?? []).map((d) => ({
    date: d.date.slice(8), // day-of-month
    in: Number(d.in),
    out: Number(d.out),
  }));

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('dashboard.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="h-9 w-48 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('dashboard.allEntities')}</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} tint="primary" label={t('dashboard.kpi.balance')} value={data?.totalBalance} loading={isLoading} />
        <KpiCard icon={ArrowDownLeft} tint="success" label={t('dashboard.kpi.in')} value={data?.totalIn} loading={isLoading} />
        <KpiCard icon={ArrowUpRight} tint="warning" label={t('dashboard.kpi.out')} value={data?.totalOut} loading={isLoading} />
        <KpiCard icon={data && Number(data.net) < 0 ? TrendingDown : TrendingUp} tint="info" label={t('dashboard.kpi.net')} value={data?.net} loading={isLoading} />
      </div>

      {/* In/out chart */}
      <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary mb-4">{t('dashboard.chart.title')}</h2>
        {isLoading ? (
          <Skeleton className="h-72 w-full rounded" />
        ) : chartData.length === 0 ? (
          <EmptyMonth t={t} />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => formatVnd(v)} width={72} />
                <Tooltip
                  formatter={(v) => formatVnd(v as number)}
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="in" name={t('dashboard.chart.in')} fill="var(--color-success)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="out" name={t('dashboard.chart.out')} fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary mb-4">{t('dashboard.categories.title')}</h2>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : !data || data.byCategory.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">{t('dashboard.categories.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {data.byCategory.map((c) => {
              const max = Number(data.byCategory[0].total) || 1;
              const pct = Math.round((Number(c.total) / max) * 100);
              return (
                <li key={c.categoryId ?? 'none'} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-text-secondary truncate shrink-0">{c.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-alt overflow-hidden">
                    <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-32 text-right text-sm font-medium text-text-primary tabular-nums shrink-0">
                    {formatVnd(c.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  tint,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  tint: 'primary' | 'success' | 'warning' | 'info';
  label: string;
  value?: string;
  loading?: boolean;
}) {
  const tintClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success-light text-success',
    warning: 'bg-warning-light text-warning',
    info: 'bg-info-light text-info',
  }[tint];
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-28 mt-2 rounded" />
          ) : (
            <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums text-text-primary truncate">
              {formatVnd(value)}
            </p>
          )}
        </div>
        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${tintClasses}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function EmptyMonth({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-text-primary font-medium">{t('dashboard.chart.empty')}</p>
      <Link to="/finance/transactions" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <PlusCircle className="size-4" />
        {t('dashboard.chart.emptyCta')}
      </Link>
    </div>
  );
}
