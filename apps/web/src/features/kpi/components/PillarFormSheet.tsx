import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KpiPillarDto, UpsertKpiPillarInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KpiPillarDto | null;
  onSubmit: (body: UpsertKpiPillarInput) => void;
  isLoading?: boolean;
}

export function PillarFormSheet({ open, onOpenChange, initial, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('0');
  const [color, setColor] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setWeight(String(initial?.weight ?? 0));
      setColor(initial?.color ?? '');
    }
  }, [open, initial]);

  function submit() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), weight: Number(weight) || 0, color: color.trim() || null });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{initial ? t('pillar.editTitle') : t('pillar.createTitle')}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t('pillar.name')} <span className="text-danger">*</span></Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-weight">{t('pillar.weight')} (%)</Label>
            <Input id="p-weight" type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} className="tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-color">{t('pillar.color')}</Label>
            <Input id="p-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#4A9EBF" />
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
