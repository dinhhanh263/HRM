import { useTranslation } from 'react-i18next';
import { Trophy, Users } from 'lucide-react';
import type { KpiCycleDetailDto } from '@hrm/shared';

const avg = (ns: number[]) => (ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 100) / 100 : null);

/** Tổng hợp team từ scorecards của cycle (tính client-side): trung bình, quán quân, TB theo trụ cột. */
export function TeamAggregate({ cycle }: { cycle: KpiCycleDetailDto }) {
  const { t } = useTranslation('kpi');
  const scored = cycle.scorecards.filter((s) => s.weightedTotal !== null);
  if (scored.length === 0) return null;

  const totals = scored.map((s) => s.weightedTotal as number);
  const teamAvg = avg(totals);
  const top = scored.reduce((a, b) => ((b.weightedTotal as number) > (a.weightedTotal as number) ? b : a));

  const pillarAverages = cycle.framework.pillars.map((p) => {
    const vals = scored
      .map((s) => s.pillars.find((x) => x.pillarId === p.id)?.score)
      .filter((v): v is number => v != null);
    return { name: p.name, avg: avg(vals) };
  });

  return (
    <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={16} className="text-primary" />{t('aggregate.title')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wide">{t('aggregate.teamAvg')}</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{teamAvg ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wide">{t('aggregate.scored')}</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{scored.length}/{cycle.scorecards.length}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-text-muted uppercase tracking-wide flex items-center gap-1"><Trophy size={12} className="text-warning" />{t('aggregate.topPerformer')}</p>
          <p className="text-base font-semibold mt-1 truncate">{top.employeeName} <span className="tabular-nums text-text-secondary">· {top.weightedTotal}</span></p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 border-t border-border">
        {pillarAverages.map((p) => (
          <span key={p.name} className="text-sm text-text-secondary">
            {p.name}: <span className="font-medium tabular-nums text-text-primary">{p.avg ?? '—'}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
