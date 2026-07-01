import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateTopUpRequest } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { groupThousands } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { useIssuingEntitiesLite } from '../hooks/useFundAccounts';
import { useJustificationDraft } from '../hooks/useTopUpRequests';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateTopUpRequest) => void;
  isLoading?: boolean;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

export function TopUpRequestFormSheet({ open, onOpenChange, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { data: entities = [] } = useIssuingEntitiesLite();
  const draftMutation = useJustificationDraft();

  const [entityId, setEntityId] = useState('');
  const [period, setPeriod] = useState(currentMonth());
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [neededBy, setNeededBy] = useState(today());
  const [justification, setJustification] = useState('');

  useEffect(() => {
    if (open) {
      setEntityId(entities[0]?.id ?? '');
      setPeriod(currentMonth());
      setTitle('');
      setAmount('');
      setNeededBy(today());
      setJustification('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function generate() {
    draftMutation.mutate(
      { issuingEntityId: entityId || undefined, month: period },
      {
        onSuccess: (d) => {
          setJustification(d.text);
          if (!amount) setAmount(groupThousands(d.suggestedAmount));
          if (!title.trim()) setTitle(`Nạp quỹ kỳ ${d.period}`);
        },
        onError: () => toast.error(t('topup.toast.draftError')),
      },
    );
  }

  function handleSubmit() {
    const numericAmount = Number(amount.replace(/\D/g, ''));
    if (!entityId || !title.trim() || numericAmount <= 0 || !justification.trim()) return;
    onSubmit({
      issuingEntityId: entityId,
      title: title.trim(),
      amount: numericAmount,
      neededByDate: neededBy || null,
      period: period || null,
      justification: justification.trim(),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('topup.form.create')}</SheetTitle>
          <SheetDescription>{t('topup.form.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('topup.form.entity')} <span className="text-danger">*</span></Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger><SelectValue placeholder={t('topup.form.entityPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('topup.form.period')}</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('topup.form.title')} <span className="text-danger">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('topup.form.titlePlaceholder')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('topup.form.amount')} <span className="text-danger">*</span></Label>
              <div className="flex">
                <Input inputMode="numeric" className="rounded-r-none tabular-nums" placeholder="0" value={amount} onChange={(e) => setAmount(groupThousands(e.target.value))} />
                <span className="flex items-center px-3 border border-l-0 rounded-r-md bg-surface-alt text-text-muted text-sm">VND</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('topup.form.neededBy')}</Label>
              <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('topup.form.justification')} <span className="text-danger">*</span></Label>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={generate} disabled={!entityId || draftMutation.isPending}>
                <Sparkles className="size-3.5 mr-1.5" />
                {draftMutation.isPending ? tc('states.loading') : t('topup.form.autoDraft')}
              </Button>
            </div>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder={t('topup.form.justificationPlaceholder')} className="min-h-[140px]" />
            <p className="text-xs text-text-muted">{t('topup.form.autoDraftHint')}</p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading || !entityId}>
            {isLoading ? tc('states.saving') : t('topup.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
