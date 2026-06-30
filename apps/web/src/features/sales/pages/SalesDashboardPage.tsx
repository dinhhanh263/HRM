import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { TrendingUp, Target, Trophy, Users } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { Skeleton } from '@/components/ui/skeleton';
import { useSalesOverview, useSalesForecast, useSalesByOwner } from '../hooks/useReports';

function compact(v: string | number): string {
  const n = Number(v);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} tr`;
  return n.toLocaleString('vi-VN');
}
const BAR = 'var(--color-primary)';

export function SalesDashboardPage() {
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const viewAll = can('sales:view_all');
  const { data: overview, isLoading } = useSalesOverview();
  const { data: forecast } = useSalesForecast();
  const { data: byOwner } = useSalesByOwner(viewAll);

  if (isLoading || !overview) {
    return (
      <div className="p-6 space-y-6 max-w-screen-xl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  const totalLeads = Object.values(overview.lifecycleCounts).reduce((a, b) => a + b, 0);
  const pipelineData = overview.pipeline.map((p) => ({ name: p.name, amount: Number(p.amount) }));
  const sourceData = Object.entries(overview.sourceCounts).map(([name, count]) => ({ name, count }));
  const ownerData = (byOwner ?? []).map((o) => ({ name: o.ownerName, count: o.count }));

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={TrendingUp} label={t('dashboard.openPipeline')} value={compact(overview.openPipelineTotal)} />
        <Stat icon={Target} label={t('dashboard.forecast')} value={compact(forecast?.weightedTotal ?? '0')} />
        <Stat icon={Trophy} label={t('dashboard.wonThisMonth')} value={compact(overview.wonThisMonth.amount)} sub={`${overview.wonThisMonth.count}`} />
        <Stat icon={Users} label={t('dashboard.totalLeads')} value={String(totalLeads)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.pipelineByStage')}>
          {pipelineData.length === 0 ? <Empty t={t} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipelineData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} width={50} />
                <Tooltip formatter={(v) => compact(Number(v))} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                <Bar dataKey="amount" fill={BAR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t('dashboard.leadSources')}>
          {sourceData.length === 0 ? <Empty t={t} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sourceData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {sourceData.map((_, i) => <Cell key={i} fill={BAR} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {viewAll && ownerData.length > 0 && (
        <ChartCard title={t('dashboard.byOwner')}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ownerData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} width={40} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
              <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums">{value}</p>
          {sub && <p className="text-xs text-text-muted mt-1 tabular-nums">{sub}</p>}
        </div>
        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon size={18} className="text-primary" /></div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-base font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ t }: { t: (k: string) => string }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-text-muted">{t('dashboard.empty')}</div>;
}
