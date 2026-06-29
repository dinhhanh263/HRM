import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KpiFrameworkDto, UpsertKpiFrameworkInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KpiFrameworkDto | null;
  onSubmit: (body: UpsertKpiFrameworkInput) => void;
  isLoading?: boolean;
}

export function FrameworkFormSheet({ open, onOpenChange, initial, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodType, setPeriodType] = useState('MONTHLY');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setPeriodType(initial?.defaultPeriodType ?? 'MONTHLY');
      setTouched(false);
    }
  }, [open, initial]);

  const invalid = touched && name.trim().length === 0;

  function submit() {
    setTouched(true);
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      defaultPeriodType: periodType as UpsertKpiFrameworkInput['defaultPeriodType'],
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{initial ? t('framework.editTitle') : t('framework.createTitle')}</SheetTitle>
          <SheetDescription>{t('framework.formDescription')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fw-name">{t('framework.name')} <span className="text-danger">*</span></Label>
            <Input id="fw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('framework.namePlaceholder')} />
            {invalid && <p className="text-xs text-danger">{t('framework.nameRequired')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fw-desc">{t('framework.description')}</Label>
            <Textarea id="fw-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fw-period">{t('framework.periodType')}</Label>
            <Select value={periodType} onValueChange={setPeriodType}>
              <SelectTrigger id="fw-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">{t('period.MONTHLY')}</SelectItem>
                <SelectItem value="QUARTERLY">{t('period.QUARTERLY')}</SelectItem>
                <SelectItem value="ANNUAL">{t('period.ANNUAL')}</SelectItem>
              </SelectContent>
            </Select>
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
