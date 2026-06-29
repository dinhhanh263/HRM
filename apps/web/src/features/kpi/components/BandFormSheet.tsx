import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KpiRatingBandDto, UpsertKpiRatingBandInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KpiRatingBandDto | null;
  onSubmit: (body: UpsertKpiRatingBandInput) => void;
  isLoading?: boolean;
}

export function BandFormSheet({ open, onOpenChange, initial, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [label, setLabel] = useState('');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('100');
  const [color, setColor] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setMin(String(initial?.minScore ?? 0));
      setMax(String(initial?.maxScore ?? 100));
      setColor(initial?.color ?? '');
      setAction(initial?.recommendedAction ?? '');
    }
  }, [open, initial]);

  const rangeInvalid = Number(min) > Number(max);

  function submit() {
    if (!label.trim() || rangeInvalid) return;
    onSubmit({
      label: label.trim(), minScore: Number(min), maxScore: Number(max),
      color: color.trim() || null, recommendedAction: action.trim() || null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{initial ? t('band.editTitle') : t('band.createTitle')}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            <Label>{t('band.label')} <span className="text-danger">*</span></Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="⭐ Xuất sắc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('band.minScore')}</Label>
              <Input type="number" min={0} max={100} value={min} onChange={(e) => setMin(e.target.value)} className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('band.maxScore')}</Label>
              <Input type="number" min={0} max={100} value={max} onChange={(e) => setMax(e.target.value)} className="tabular-nums" />
            </div>
          </div>
          {rangeInvalid && <p className="text-xs text-danger">{t('band.rangeInvalid')}</p>}
          <div className="space-y-1.5">
            <Label>{t('band.color')}</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#22C55E" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('band.recommendedAction')}</Label>
            <Textarea value={action} onChange={(e) => setAction(e.target.value)} />
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
