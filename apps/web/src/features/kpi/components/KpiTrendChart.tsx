import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { KpiScorecardHistoryPoint } from '@hrm/shared';

interface Props {
  points: KpiScorecardHistoryPoint[];
}

/** Biểu đồ xu hướng điểm tổng (weighted) theo kỳ. */
export function KpiTrendChart({ points }: Props) {
  const { t } = useTranslation('kpi');
  const data = points.map((p) => ({ period: p.period, total: p.weightedTotal }));

  if (data.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">{t('me.noData')}</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 8, fontSize: 13,
            }}
            labelStyle={{ color: 'var(--color-text-secondary)' }}
          />
          <Line type="monotone" dataKey="total" name={t('cycle.total')} stroke="var(--color-primary)"
            strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
