import { useTranslation } from 'react-i18next';
import type { KpiEmployeeHistoryDto } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { KpiTrendChart } from './KpiTrendChart';

interface Props {
  history: KpiEmployeeHistoryDto | undefined;
  isLoading: boolean;
}

/** Dashboard cá nhân: scorecard kỳ gần nhất + xu hướng + bảng theo kỳ. Dùng cho /kpi/me và xem NV khác. */
export function EmployeeKpiDashboard({ history, isLoading }: Props) {
  const { t } = useTranslation('kpi');

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded" />)}</div>;
  }
  if (!history || history.points.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-10 text-center text-text-muted">
        {t('me.empty')}
      </div>
    );
  }

  const latest = history.points[history.points.length - 1];
  const prev = history.points.length > 1 ? history.points[history.points.length - 2] : null;
  const delta = latest.weightedTotal != null && prev?.weightedTotal != null
    ? Math.round((latest.weightedTotal - prev.weightedTotal) * 100) / 100 : null;

  return (
    <div className="space-y-6">
      {/* Latest summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{t('me.latestTotal')}</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums mt-1">{latest.weightedTotal ?? '—'}</p>
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1.5">
            <span>{latest.period}</span>
            {delta != null && (
              <span className={cn('font-medium tabular-nums', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-muted')}>
                {delta > 0 ? '▲' : delta < 0 ? '▼' : ''} {delta > 0 ? '+' : ''}{delta} {t('me.vsPrev')}
              </span>
            )}
          </p>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{t('cycle.rating')}</p>
          <p className="text-base font-semibold mt-2">{latest.ratingLabel ?? '—'}</p>
        </div>
        {latest.pillars.slice(0, 2).map((p) => (
          <div key={p.pillarName} className="bg-surface rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide truncate">{p.pillarName}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{p.score ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Trend */}
      <div className="bg-surface rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-3">{t('me.trend')}</h2>
        <KpiTrendChart points={history.points} />
      </div>

      {/* History table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt/50 text-text-secondary text-xs uppercase tracking-wide">
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.period')}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.framework')}</th>
              <th className="text-right font-semibold px-4 py-2.5">{t('cycle.total')}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.rating')}</th>
            </tr>
          </thead>
          <tbody>
            {[...history.points].reverse().map((p) => (
              <tr key={p.cycleId} className="border-t border-border">
                <td className="px-4 py-2.5 tabular-nums">{p.period}</td>
                <td className="px-4 py-2.5 text-text-secondary">{p.frameworkName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{p.weightedTotal ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs">{p.ratingLabel ?? <Badge variant="outline">—</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
