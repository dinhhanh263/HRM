import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KpiDefinitionDto, UpsertKpiDefinitionInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KpiDefinitionDto | null;
  onSubmit: (body: UpsertKpiDefinitionInput) => void;
  isLoading?: boolean;
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export function DefinitionFormSheet({ open, onOpenChange, initial, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [f, setF] = useState({
    code: '', name: '', description: '', dataSource: '', unit: '',
    direction: 'HIGHER_BETTER', target: '', min: '', weight: '0',
    scope: 'INDIVIDUAL', inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR',
  });

  useEffect(() => {
    if (open) {
      setF({
        code: initial?.code ?? '', name: initial?.name ?? '',
        description: initial?.description ?? '', dataSource: initial?.dataSource ?? '',
        unit: initial?.unit ?? '', direction: initial?.direction ?? 'HIGHER_BETTER',
        target: initial?.targetValue?.toString() ?? '', min: initial?.minValue?.toString() ?? '',
        weight: String(initial?.weightInPillar ?? 0), scope: initial?.scope ?? 'INDIVIDUAL',
        inputType: initial?.inputType ?? 'MANUAL', scoringMethod: initial?.scoringMethod ?? 'THRESHOLD_LINEAR',
      });
    }
  }, [open, initial]);

  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  function submit() {
    if (!f.code.trim() || !f.name.trim()) return;
    onSubmit({
      code: f.code.trim(), name: f.name.trim(),
      description: f.description.trim() || null, dataSource: f.dataSource.trim() || null,
      unit: f.unit.trim() || null,
      direction: f.direction as UpsertKpiDefinitionInput['direction'],
      targetValue: numOrNull(f.target), minValue: numOrNull(f.min),
      weightInPillar: Number(f.weight) || 0,
      scope: f.scope as UpsertKpiDefinitionInput['scope'],
      inputType: f.inputType as UpsertKpiDefinitionInput['inputType'],
      scoringMethod: f.scoringMethod as UpsertKpiDefinitionInput['scoringMethod'],
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{initial ? t('kpi.editTitle') : t('kpi.createTitle')}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t('kpi.code')} <span className="text-danger">*</span></Label>
              <Input value={f.code} onChange={(e) => set('code')(e.target.value)} placeholder="D1" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('kpi.name')} <span className="text-danger">*</span></Label>
              <Input value={f.name} onChange={(e) => set('name')(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('kpi.description')}</Label>
            <Textarea value={f.description} onChange={(e) => set('description')(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('kpi.dataSource')}</Label>
              <Input value={f.dataSource} onChange={(e) => set('dataSource')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('kpi.unit')}</Label>
              <Input value={f.unit} onChange={(e) => set('unit')(e.target.value)} placeholder="%, hours…" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t('kpi.direction')}</Label>
              <Select value={f.direction} onValueChange={set('direction')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGHER_BETTER">{t('direction.HIGHER_BETTER')}</SelectItem>
                  <SelectItem value="LOWER_BETTER">{t('direction.LOWER_BETTER')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('kpi.target')}</Label>
              <Input type="number" value={f.target} onChange={(e) => set('target')(e.target.value)} className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('kpi.min')}</Label>
              <Input type="number" value={f.min} onChange={(e) => set('min')(e.target.value)} className="tabular-nums" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('kpi.scope')}</Label>
              <Select value={f.scope} onValueChange={set('scope')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">{t('scope.INDIVIDUAL')}</SelectItem>
                  <SelectItem value="TEAM">{t('scope.TEAM')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('kpi.weightInPillar')} (%)</Label>
              <Input type="number" min={0} max={100} value={f.weight} onChange={(e) => set('weight')(e.target.value)} className="tabular-nums" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('kpi.inputType')}</Label>
              <Select value={f.inputType} onValueChange={set('inputType')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">{t('inputType.MANUAL')}</SelectItem>
                  <SelectItem value="SURVEY">{t('inputType.SURVEY')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('kpi.scoringMethod')}</Label>
              <Select value={f.scoringMethod} onValueChange={set('scoringMethod')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="THRESHOLD_LINEAR">{t('scoringMethod.THRESHOLD_LINEAR')}</SelectItem>
                  <SelectItem value="DIRECT">{t('scoringMethod.DIRECT')}</SelectItem>
                  <SelectItem value="BOOLEAN">{t('scoringMethod.BOOLEAN')}</SelectItem>
                  <SelectItem value="BANDED">{t('scoringMethod.BANDED')}</SelectItem>
                </SelectContent>
              </Select>
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
