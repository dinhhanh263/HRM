import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Gauge } from 'lucide-react';
import type { CreateKpiCycleInput } from '@hrm/shared';
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
import { useKpiFrameworks, useKpiCycles, useKpiCycleMutations } from '../hooks/useKpiConfig';
import { CycleStatusBadge } from '../components/CycleStatusBadge';

export function KpiCyclesPage() {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { data: cycles, isLoading } = useKpiCycles();
  const { create } = useKpiCycleMutations();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gauge size={22} className="text-primary" />{t('cycle.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('cycle.subtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1.5" />{t('cycle.create')}</Button>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
        ) : (cycles ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">{t('cycle.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-alt/50 text-text-secondary text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-2.5">{t('cycle.framework')}</th>
                <th className="text-left font-semibold px-4 py-2.5">{t('cycle.period')}</th>
                <th className="text-left font-semibold px-4 py-2.5">{tc('actions.actions')}</th>
                <th className="text-right font-semibold px-4 py-2.5 tabular-nums">{t('cycle.scorecards')}</th>
              </tr>
            </thead>
            <tbody>
              {cycles!.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface-alt/40 cursor-pointer" onClick={() => navigate(`/kpi/${c.id}`)}>
                  <td className="px-4 py-3 font-medium">{c.frameworkName}</td>
                  <td className="px-4 py-3 tabular-nums">{c.period}</td>
                  <td className="px-4 py-3"><CycleStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.scorecardCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateCycleSheet
        open={open}
        onOpenChange={setOpen}
        isLoading={create.isPending}
        onSubmit={(body) => create.mutate(body, {
          onSuccess: (d) => { toast.success(t('cycle.created')); setOpen(false); navigate(`/kpi/${d.id}`); },
          onError: () => toast.error(tc('states.error')),
        })}
      />
    </div>
  );
}

function CreateCycleSheet({ open, onOpenChange, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (b: CreateKpiCycleInput) => void; isLoading?: boolean;
}) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: frameworks } = useKpiFrameworks();
  const [frameworkId, setFrameworkId] = useState('');
  const [period, setPeriod] = useState('');
  const [periodType, setPeriodType] = useState<CreateKpiCycleInput['periodType']>('MONTHLY');

  useEffect(() => { if (open) { setFrameworkId(''); setPeriod(''); setPeriodType('MONTHLY'); } }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{t('cycle.createTitle')}</SheetTitle></SheetHeader>
        <div className="mt-6 flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('cycle.framework')} <span className="text-danger">*</span></Label>
            <Select value={frameworkId} onValueChange={setFrameworkId}>
              <SelectTrigger><SelectValue placeholder={t('cycle.selectFramework')} /></SelectTrigger>
              <SelectContent>
                {(frameworks ?? []).filter((f) => f.isActive).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('cycle.periodType')}</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as CreateKpiCycleInput['periodType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">{t('period.MONTHLY')}</SelectItem>
                <SelectItem value="QUARTERLY">{t('period.QUARTERLY')}</SelectItem>
                <SelectItem value="ANNUAL">{t('period.ANNUAL')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('cycle.period')} <span className="text-danger">*</span></Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={periodType === 'MONTHLY' ? '2026-01' : '2026-Q1'} />
            <p className="text-xs text-text-muted">{t('cycle.periodHint')}</p>
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button disabled={!frameworkId || !period.trim() || isLoading}
            onClick={() => onSubmit({ frameworkId, period: period.trim(), periodType })}>
            {tc('actions.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
