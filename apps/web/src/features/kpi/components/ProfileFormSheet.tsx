import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KpiPillarDto, KpiWeightProfileDto, UpsertKpiWeightProfileInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pillars: KpiPillarDto[];
  initial?: KpiWeightProfileDto | null;
  onSubmit: (body: UpsertKpiWeightProfileInput) => void;
  isLoading?: boolean;
}

export function ProfileFormSheet({ open, onOpenChange, pillars, initial, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState('');
  const [weights, setWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      const w: Record<string, string> = {};
      for (const p of pillars) {
        const found = initial?.pillarWeights.find((x) => x.pillarId === p.id);
        w[p.id] = String(found?.weight ?? 0);
      }
      setWeights(w);
    }
  }, [open, initial, pillars]);

  const total = pillars.reduce((s, p) => s + (Number(weights[p.id]) || 0), 0);
  const balanced = Math.abs(total - 100) <= 0.01;

  function submit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      pillarWeights: pillars.map((p) => ({ pillarId: p.id, weight: Number(weights[p.id]) || 0 })),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{initial ? t('profile.editTitle') : t('profile.createTitle')}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            <Label>{t('profile.name')} <span className="text-danger">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dev Profile" />
          </div>
          <div className="space-y-2">
            <Label>{t('profile.pillarWeights')}</Label>
            {pillars.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-text-secondary truncate">{p.name}</span>
                <Input
                  type="number" min={0} max={100}
                  value={weights[p.id] ?? '0'}
                  onChange={(e) => setWeights((w) => ({ ...w, [p.id]: e.target.value }))}
                  className="w-24 tabular-nums"
                />
                <span className="text-xs text-text-muted w-4">%</span>
              </div>
            ))}
            <div className={cn('flex justify-between text-sm font-medium pt-2 border-t border-border',
              balanced ? 'text-success' : 'text-danger')}>
              <span>{t('profile.total')}</span>
              <span className="tabular-nums">{total}%</span>
            </div>
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button onClick={submit} disabled={isLoading}>{tc('actions.save')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
