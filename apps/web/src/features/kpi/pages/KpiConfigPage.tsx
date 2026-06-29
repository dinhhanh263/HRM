import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import type {
  KpiFrameworkListItemDto, KpiPillarDto, KpiDefinitionDto, KpiWeightProfileDto, KpiRatingBandDto,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import {
  useKpiFrameworks, useKpiFramework, useKpiValidation, useKpiFrameworkMutations,
} from '../hooks/useKpiConfig';
import { FrameworkFormSheet } from '../components/FrameworkFormSheet';
import { PillarFormSheet } from '../components/PillarFormSheet';
import { DefinitionFormSheet } from '../components/DefinitionFormSheet';
import { ProfileFormSheet } from '../components/ProfileFormSheet';
import { BandFormSheet } from '../components/BandFormSheet';

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

export function KpiConfigPage() {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: frameworks, isLoading } = useKpiFrameworks();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && frameworks && frameworks.length > 0) setSelectedId(frameworks[0].id);
  }, [frameworks, selectedId]);

  const { data: fw } = useKpiFramework(selectedId ?? undefined);
  const { data: validation } = useKpiValidation(selectedId ?? undefined);
  const m = useKpiFrameworkMutations(selectedId ?? undefined);

  // Sheet state
  const [fwSheet, setFwSheet] = useState<'create' | 'edit' | null>(null);
  const [pillarSheet, setPillarSheet] = useState<KpiPillarDto | 'new' | null>(null);
  const [defSheet, setDefSheet] = useState<{ pillarId: string; def: KpiDefinitionDto | null } | null>(null);
  const [profileSheet, setProfileSheet] = useState<KpiWeightProfileDto | 'new' | null>(null);
  const [bandSheet, setBandSheet] = useState<KpiRatingBandDto | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; run: () => void } | null>(null);

  const ok = (msg: string) => () => toast.success(msg);
  const fail = () => toast.error(tc('states.error'));

  const pillarTotal = useMemo(() => sum((fw?.pillars ?? []).map((p) => p.weight)), [fw]);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target size={22} className="text-primary" />{t('config.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('config.subtitle')}</p>
        </div>
        <Button onClick={() => setFwSheet('create')}>
          <Plus size={16} className="mr-1.5" />{t('framework.create')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Framework list */}
        <div className="bg-surface rounded-lg border border-border overflow-hidden h-fit">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
          ) : (frameworks ?? []).length === 0 ? (
            <p className="p-4 text-sm text-text-muted">{t('config.empty')}</p>
          ) : (
            <ul>
              {frameworks!.map((f: KpiFrameworkListItemDto) => (
                <li key={f.id}>
                  <button
                    onClick={() => setSelectedId(f.id)}
                    className={cn('w-full text-left px-4 py-3 border-b border-border transition-colors',
                      selectedId === f.id ? 'bg-primary-light text-primary' : 'hover:bg-surface-alt')}>
                    <div className="font-medium text-sm truncate">{f.name}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {f.pillarCount} {t('config.pillarsShort')} · {f.kpiCount} KPI · {f.departmentCount} {t('config.deptsShort')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        {!fw ? (
          <div className="bg-surface rounded-lg border border-border p-10 text-center text-text-muted">
            {t('config.selectHint')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg border border-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{fw.name}</h2>
                    {!fw.isActive && <Badge variant="outline">{t('framework.inactive')}</Badge>}
                  </div>
                  {fw.description && <p className="text-sm text-text-secondary mt-1">{fw.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFwSheet('edit')} aria-label={tc('actions.edit')}>
                    <Pencil size={15} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-danger"
                    onClick={() => setConfirm({ label: fw.name, run: () => m.deleteFramework.mutate(fw.id, { onSuccess: () => { toast.success(t('toast.deleted')); setSelectedId(null); }, onError: fail }) })}
                    aria-label={tc('actions.delete')}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
              {/* Validation banner */}
              {validation && (
                validation.valid ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 size={15} />{t('config.balanced')}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md bg-warning-light text-warning p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium"><AlertTriangle size={15} />{t('config.issuesTitle')}</div>
                    <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                      {validation.issues.map((iss, idx) => (
                        <li key={idx}>{t(`config.issueScope.${iss.scope}`)}{iss.label ? ` — ${iss.label}` : ''}: {iss.actualSum}% (≠100%)</li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>

            <Tabs defaultValue="structure">
              <TabsList>
                <TabsTrigger value="structure">{t('tabs.structure')}</TabsTrigger>
                <TabsTrigger value="profiles">{t('tabs.profiles')}</TabsTrigger>
                <TabsTrigger value="bands">{t('tabs.bands')}</TabsTrigger>
                <TabsTrigger value="departments">{t('tabs.departments')}</TabsTrigger>
              </TabsList>

              {/* Structure: pillars + KPIs */}
              <TabsContent value="structure" className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-medium', Math.abs(pillarTotal - 100) <= 0.01 ? 'text-success' : 'text-danger')}>
                    {t('config.pillarTotal')}: <span className="tabular-nums">{pillarTotal}%</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setPillarSheet('new')}>
                    <Plus size={14} className="mr-1.5" />{t('pillar.add')}
                  </Button>
                </div>
                {fw.pillars.map((p) => {
                  const kpiTotal = sum(p.definitions.map((d) => d.weightInPillar));
                  return (
                    <div key={p.id} className="bg-surface rounded-lg border border-border">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          <Badge variant="outline" className="tabular-nums">{p.weight}%</Badge>
                          {p.definitions.length > 0 && (
                            <Badge variant="outline" className={cn('tabular-nums', Math.abs(kpiTotal - 100) <= 0.01 ? 'text-success' : 'text-danger')}>
                              KPI Σ {kpiTotal}%
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7" onClick={() => setDefSheet({ pillarId: p.id, def: null })}>
                            <Plus size={13} className="mr-1" />{t('kpi.add')}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPillarSheet(p)} aria-label={tc('actions.edit')}><Pencil size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={tc('actions.delete')}
                            onClick={() => setConfirm({ label: p.name, run: () => m.removePillar.mutate(p.id, { onSuccess: ok(t('toast.deleted')), onError: fail }) })}><Trash2 size={14} /></Button>
                        </div>
                      </div>
                      {p.definitions.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-text-muted">{t('kpi.empty')}</p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {p.definitions.map((d) => (
                            <li key={d.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt/40">
                              <Badge variant="outline" className="shrink-0">{d.code}</Badge>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{d.name}</div>
                                <div className="text-xs text-text-muted">
                                  {t(`scope.${d.scope}`)} · {t(`direction.${d.direction}`)}
                                  {d.targetValue != null && <> · 🎯 {d.targetValue}{d.unit ?? ''}</>}
                                  {d.minValue != null && <> · ⚠ {d.minValue}{d.unit ?? ''}</>}
                                </div>
                              </div>
                              <Badge variant="outline" className="tabular-nums shrink-0">{d.weightInPillar}%</Badge>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDefSheet({ pillarId: p.id, def: d })} aria-label={tc('actions.edit')}><Pencil size={13} /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={tc('actions.delete')}
                                  onClick={() => setConfirm({ label: d.name, run: () => m.removeDefinition.mutate(d.id, { onSuccess: ok(t('toast.deleted')), onError: fail }) })}><Trash2 size={13} /></Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </TabsContent>

              {/* Profiles */}
              <TabsContent value="profiles" className="space-y-3">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setProfileSheet('new')} disabled={fw.pillars.length === 0}>
                    <Plus size={14} className="mr-1.5" />{t('profile.add')}
                  </Button>
                </div>
                {fw.weightProfiles.length === 0 ? (
                  <p className="text-sm text-text-muted">{t('profile.empty')}</p>
                ) : fw.weightProfiles.map((pr) => (
                  <div key={pr.id} className="bg-surface rounded-lg border border-border p-4 flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">{pr.name}</div>
                      <div className="text-xs text-text-muted mt-1 flex flex-wrap gap-x-3">
                        {pr.pillarWeights.map((w) => {
                          const pn = fw.pillars.find((p) => p.id === w.pillarId)?.name ?? '?';
                          return <span key={w.pillarId} className="tabular-nums">{pn}: {w.weight}%</span>;
                        })}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProfileSheet(pr)} aria-label={tc('actions.edit')}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={tc('actions.delete')}
                        onClick={() => setConfirm({ label: pr.name, run: () => m.removeProfile.mutate(pr.id, { onSuccess: ok(t('toast.deleted')), onError: fail }) })}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* Bands */}
              <TabsContent value="bands" className="space-y-3">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setBandSheet('new')}>
                    <Plus size={14} className="mr-1.5" />{t('band.add')}
                  </Button>
                </div>
                {fw.ratingBands.map((b) => (
                  <div key={b.id} className="bg-surface rounded-lg border border-border p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: b.color ?? 'var(--color-border-strong)' }} />
                      <span className="font-medium text-sm">{b.label}</span>
                      <Badge variant="outline" className="tabular-nums">{b.minScore}–{b.maxScore}</Badge>
                      {b.recommendedAction && <span className="text-xs text-text-muted truncate max-w-md">{b.recommendedAction}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBandSheet(b)} aria-label={tc('actions.edit')}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={tc('actions.delete')}
                        onClick={() => setConfirm({ label: b.label, run: () => m.removeBand.mutate(b.id, { onSuccess: ok(t('toast.deleted')), onError: fail }) })}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* Departments */}
              <TabsContent value="departments">
                <DepartmentAssign
                  selected={fw.departmentIds}
                  onSave={(ids) => m.setDepartments.mutate(ids, { onSuccess: ok(t('toast.saved')), onError: fail })}
                  saving={m.setDepartments.isPending}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Sheets */}
      <FrameworkFormSheet
        open={fwSheet !== null} onOpenChange={(o) => !o && setFwSheet(null)}
        initial={fwSheet === 'edit' ? fw : null}
        isLoading={m.createFramework.isPending || m.updateFramework.isPending}
        onSubmit={(body) => {
          if (fwSheet === 'create') {
            m.createFramework.mutate(body, { onSuccess: (created) => { toast.success(t('toast.created')); setSelectedId(created.id); setFwSheet(null); }, onError: fail });
          } else {
            m.updateFramework.mutate(body, { onSuccess: () => { toast.success(t('toast.saved')); setFwSheet(null); }, onError: fail });
          }
        }}
      />
      {fw && (
        <>
          <PillarFormSheet
            open={pillarSheet !== null} onOpenChange={(o) => !o && setPillarSheet(null)}
            initial={pillarSheet && pillarSheet !== 'new' ? pillarSheet : null}
            isLoading={m.addPillar.isPending || m.updatePillar.isPending}
            onSubmit={(body) => {
              const done = { onSuccess: () => { toast.success(t('toast.saved')); setPillarSheet(null); }, onError: fail };
              if (pillarSheet === 'new') m.addPillar.mutate(body, done);
              else if (pillarSheet) m.updatePillar.mutate({ pillarId: pillarSheet.id, body }, done);
            }}
          />
          <DefinitionFormSheet
            open={defSheet !== null} onOpenChange={(o) => !o && setDefSheet(null)}
            initial={defSheet?.def ?? null}
            isLoading={m.addDefinition.isPending || m.updateDefinition.isPending}
            onSubmit={(body) => {
              const done = { onSuccess: () => { toast.success(t('toast.saved')); setDefSheet(null); }, onError: fail };
              if (defSheet?.def) m.updateDefinition.mutate({ defId: defSheet.def.id, body }, done);
              else if (defSheet) m.addDefinition.mutate({ pillarId: defSheet.pillarId, body }, done);
            }}
          />
          <ProfileFormSheet
            open={profileSheet !== null} onOpenChange={(o) => !o && setProfileSheet(null)}
            pillars={fw.pillars}
            initial={profileSheet && profileSheet !== 'new' ? profileSheet : null}
            isLoading={m.addProfile.isPending || m.updateProfile.isPending}
            onSubmit={(body) => {
              const done = { onSuccess: () => { toast.success(t('toast.saved')); setProfileSheet(null); }, onError: fail };
              if (profileSheet === 'new') m.addProfile.mutate(body, done);
              else if (profileSheet) m.updateProfile.mutate({ profileId: profileSheet.id, body }, done);
            }}
          />
          <BandFormSheet
            open={bandSheet !== null} onOpenChange={(o) => !o && setBandSheet(null)}
            initial={bandSheet && bandSheet !== 'new' ? bandSheet : null}
            isLoading={m.addBand.isPending || m.updateBand.isPending}
            onSubmit={(body) => {
              const done = { onSuccess: () => { toast.success(t('toast.saved')); setBandSheet(null); }, onError: fail };
              if (bandSheet === 'new') m.addBand.mutate(body, done);
              else if (bandSheet) m.updateBand.mutate({ bandId: bandSheet.id, body }, done);
            }}
          />
        </>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('config.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('config.confirmDeleteDesc', { name: confirm?.label })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => { confirm?.run(); setConfirm(null); }}>
              {tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DepartmentAssign({ selected, onSave, saving }: { selected: string[]; onSave: (ids: string[]) => void; saving: boolean }) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: departments } = useDepartments();
  const [picked, setPicked] = useState<string[]>(selected);
  useEffect(() => { setPicked(selected); }, [selected]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <p className="text-sm text-text-secondary">{t('departments.hint')}</p>
      <div className="flex flex-wrap gap-2">
        {(departments ?? []).map((d) => (
          <button key={d.id} onClick={() => toggle(d.id)}
            className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors',
              picked.includes(d.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-surface-alt')}>
            {d.name}
          </button>
        ))}
      </div>
      <Button size="sm" onClick={() => onSave(picked)} disabled={saving}>{tc('actions.save')}</Button>
    </div>
  );
}
