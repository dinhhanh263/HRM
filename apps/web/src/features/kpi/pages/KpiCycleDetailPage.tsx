import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Save, Pencil, MessageSquare, Download } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { kpiApi } from '../api';
import type { KpiCycleDetailDto, KpiScorecardDto, KpiCycleStatus } from '@hrm/shared';
import { KPI_CYCLE_TRANSITIONS } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useKpiCycle, useKpiCycleMutations } from '../hooks/useKpiConfig';
import { CycleStatusBadge } from '../components/CycleStatusBadge';
import { TeamAggregate } from '../components/TeamAggregate';
import { ReviewSheet } from '../components/ReviewSheet';

const NEXT_LABEL: Partial<Record<KpiCycleStatus, string>> = {
  DATA_ENTRY: 'cycle.transitions.openEntry',
  SELF_ASSESSMENT: 'cycle.transitions.toSelfAssess',
  PENDING_REVIEW: 'cycle.transitions.toReview',
  FINALIZED: 'cycle.transitions.finalize',
  CLOSED: 'cycle.transitions.close',
};

export function KpiCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { data: cycle, isLoading } = useKpiCycle(id);
  const m = useKpiCycleMutations(id);
  const { can } = usePermission();

  async function handleExport() {
    if (!cycle) return;
    try {
      const res = await kpiApi.exportCycle(cycle.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kpi-${cycle.frameworkName}-${cycle.period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tc('states.error'));
    }
  }
  const [entryFor, setEntryFor] = useState<KpiScorecardDto | null>(null);
  const [reviewFor, setReviewFor] = useState<KpiScorecardDto | null>(null);

  const fail = () => toast.error(tc('states.error'));

  const teamDefs = useMemo(
    () => (cycle?.framework.pillars ?? []).flatMap((p) => p.definitions).filter((d) => d.scope === 'TEAM'),
    [cycle],
  );

  if (isLoading || !cycle) {
    return <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>;
  }

  const editable = cycle.status === 'DATA_ENTRY';
  const nextStatuses = KPI_CYCLE_TRANSITIONS[cycle.status] ?? [];

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <button onClick={() => navigate('/kpi')} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
        <ChevronLeft size={15} />{t('cycle.backToList')}
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{cycle.frameworkName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-text-secondary tabular-nums">{cycle.period}</span>
            <CycleStatusBadge status={cycle.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {can('kpi:export') && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download size={14} className="mr-1.5" />{t('export.button')}
            </Button>
          )}
          {nextStatuses.map((s) => (
            <Button key={s} variant={s === 'DATA_ENTRY' || s === 'FINALIZED' ? 'default' : 'outline'} size="sm"
              disabled={m.transition.isPending}
              onClick={() => m.transition.mutate(s, { onSuccess: () => toast.success(t('cycle.statusUpdated')), onError: fail })}>
              {t(NEXT_LABEL[s] ?? 'cycle.transitions.generic')}
            </Button>
          ))}
        </div>
      </div>

      {/* Team metrics */}
      {teamDefs.length > 0 && cycle.teams.length > 0 && (
        <TeamMetrics cycle={cycle} editable={editable}
          onSave={(entries) => m.upsertEntries.mutate(entries, { onSuccess: () => toast.success(t('toast.saved')), onError: fail })}
          saving={m.upsertEntries.isPending} />
      )}

      {/* Survey aggregation (Team Health) */}
      {editable && (
        <div className="flex items-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={m.aggregateSurveys.isPending}
            onClick={() => m.aggregateSurveys.mutate(undefined, {
              onSuccess: (r) => toast.success(t('survey.aggregatedCount', { n: r.aggregated.length, skipped: r.skipped.length })),
              onError: fail,
            })}>
            <MessageSquare size={14} className="mr-1.5" />{t('survey.aggregate')}
          </Button>
          <span className="text-text-muted text-xs">{t('survey.aggregateHint')}</span>
        </div>
      )}

      {/* Team aggregate */}
      <TeamAggregate cycle={cycle} />

      {/* Members / scorecards */}
      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt/50 text-text-secondary text-xs uppercase tracking-wide">
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.member')}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.weightProfile')}</th>
              {cycle.framework.pillars.map((p) => (
                <th key={p.id} className="text-right font-semibold px-3 py-2.5">{p.name}</th>
              ))}
              <th className="text-right font-semibold px-4 py-2.5">{t('cycle.total')}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t('cycle.rating')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {cycle.scorecards.map((sc) => (
              <tr key={sc.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-2.5 font-medium">
                  <button className="hover:text-primary hover:underline text-left"
                    onClick={() => navigate(`/kpi/employee/${sc.employeeId}`)}>
                    {sc.employeeName}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <ProfileSelect cycle={cycle} sc={sc}
                    onChange={(weightProfileId) => m.setProfile.mutate({ scorecardId: sc.id, weightProfileId }, { onError: fail })} />
                </td>
                {cycle.framework.pillars.map((p) => {
                  const score = sc.pillars.find((x) => x.pillarId === p.id)?.score ?? null;
                  return <td key={p.id} className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{score ?? '—'}</td>;
                })}
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sc.weightedTotal ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs">{sc.ratingLabel ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {editable && (
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setEntryFor(sc)}>
                      <Pencil size={13} className="mr-1" />{t('cycle.enterValues')}
                    </Button>
                  )}
                  {cycle.status === 'PENDING_REVIEW' && (
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setReviewFor(sc)}>
                      <Pencil size={13} className="mr-1" />{t('review.action')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cycle.scorecards.length === 0 && (
          <p className="p-8 text-center text-sm text-text-muted">{t('cycle.noScorecards')}</p>
        )}
      </div>

      <ReviewSheet
        open={!!reviewFor} onOpenChange={(o) => !o && setReviewFor(null)}
        scorecard={reviewFor ? cycle.scorecards.find((s) => s.id === reviewFor.id) ?? reviewFor : null}
        saving={m.review.isPending || m.resubmit.isPending}
        onReview={(body) => reviewFor && m.review.mutate({ scorecardId: reviewFor.id, body }, {
          onSuccess: () => { toast.success(t('review.done')); setReviewFor(null); }, onError: fail,
        })}
        onResubmit={() => reviewFor && m.resubmit.mutate(reviewFor.id, {
          onSuccess: () => { toast.success(t('toast.saved')); setReviewFor(null); }, onError: fail,
        })}
      />

      {entryFor && (
        <IndividualEntrySheet cycle={cycle} scorecard={entryFor} open={!!entryFor}
          onOpenChange={(o) => !o && setEntryFor(null)} saving={m.upsertEntries.isPending}
          onSave={(entries) => m.upsertEntries.mutate(entries, {
            onSuccess: () => { toast.success(t('toast.saved')); setEntryFor(null); }, onError: fail,
          })} />
      )}
    </div>
  );
}

function ProfileSelect({ cycle, sc, onChange }: {
  cycle: KpiCycleDetailDto; sc: KpiScorecardDto; onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation('kpi');
  const NONE = '__none__';
  return (
    <Select value={sc.weightProfileId ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('cycle.noProfile')}</SelectItem>
        {cycle.framework.weightProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TeamMetrics({ cycle, editable, onSave, saving }: {
  cycle: KpiCycleDetailDto; editable: boolean;
  onSave: (entries: { kpiDefinitionId: string; teamId: string; actualValue: number | null }[]) => void; saving: boolean;
}) {
  const { t } = useTranslation('kpi');
  const teamDefs = cycle.framework.pillars.flatMap((p) => p.definitions).filter((d) => d.scope === 'TEAM');
  const initial: Record<string, string> = {};
  for (const tm of cycle.teams) for (const d of teamDefs) {
    const e = cycle.teamEntries.find((x) => x.teamId === tm.id && x.kpiDefinitionId === d.id);
    initial[`${tm.id}:${d.id}`] = e?.actualValue != null ? String(e.actualValue) : '';
  }
  const [vals, setVals] = useState<Record<string, string>>(initial);

  function save() {
    const entries = cycle.teams.flatMap((tm) =>
      teamDefs.map((d) => ({
        kpiDefinitionId: d.id, teamId: tm.id,
        actualValue: vals[`${tm.id}:${d.id}`]?.trim() ? Number(vals[`${tm.id}:${d.id}`]) : null,
      })),
    );
    onSave(entries);
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold">{t('cycle.teamMetrics')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-secondary text-xs">
              <th className="text-left font-medium px-2 py-1.5">{t('cycle.team')}</th>
              {teamDefs.map((d) => <th key={d.id} className="text-right font-medium px-2 py-1.5">{d.code} · {d.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {cycle.teams.map((tm) => (
              <tr key={tm.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-medium">{tm.name}</td>
                {teamDefs.map((d) => (
                  <td key={d.id} className="px-2 py-1.5 text-right">
                    <Input type="number" disabled={!editable} className="h-8 w-24 text-right tabular-nums ml-auto"
                      value={vals[`${tm.id}:${d.id}`] ?? ''}
                      onChange={(e) => setVals((v) => ({ ...v, [`${tm.id}:${d.id}`]: e.target.value }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <Button size="sm" onClick={save} disabled={saving}><Save size={14} className="mr-1.5" />{t('cycle.saveTeamMetrics')}</Button>}
    </div>
  );
}

function IndividualEntrySheet({ cycle, scorecard, open, onOpenChange, onSave, saving }: {
  cycle: KpiCycleDetailDto; scorecard: KpiScorecardDto; open: boolean; onOpenChange: (o: boolean) => void;
  onSave: (entries: { kpiDefinitionId: string; scorecardId: string; actualValue: number | null }[]) => void; saving: boolean;
}) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const indivPillars = cycle.framework.pillars
    .map((p) => ({ ...p, definitions: p.definitions.filter((d) => d.scope === 'INDIVIDUAL') }))
    .filter((p) => p.definitions.length > 0);

  const seed: Record<string, string> = {};
  for (const p of indivPillars) for (const d of p.definitions) {
    const e = scorecard.entries.find((x) => x.kpiDefinitionId === d.id);
    seed[d.id] = e?.actualValue != null ? String(e.actualValue) : '';
  }
  const [vals, setVals] = useState<Record<string, string>>(seed);

  function save() {
    const entries = indivPillars.flatMap((p) => p.definitions).map((d) => ({
      kpiDefinitionId: d.id, scorecardId: scorecard.id,
      actualValue: vals[d.id]?.trim() ? Number(vals[d.id]) : null,
    }));
    onSave(entries);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('cycle.enterFor', { name: scorecard.employeeName })}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-5">
          {indivPillars.map((p) => (
            <div key={p.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-text-secondary">{p.name}</h3>
              {p.definitions.map((d) => (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm">{d.code} · {d.name}</Label>
                    <p className="text-xs text-text-muted">
                      {d.targetValue != null && <>🎯 {d.targetValue}{d.unit ?? ''} </>}
                      {d.minValue != null && <>· ⚠ {d.minValue}{d.unit ?? ''}</>}
                    </p>
                  </div>
                  <Input type="number" className="h-9 w-28 text-right tabular-nums"
                    value={vals[d.id] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [d.id]: e.target.value }))} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button onClick={save} disabled={saving}>{tc('actions.save')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
