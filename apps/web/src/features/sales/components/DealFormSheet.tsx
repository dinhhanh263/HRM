import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import type { DealDto, CreateDealRequest } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCustomers } from '../hooks/useCustomers';
import { useCreateDeal, useUpdateDeal } from '../hooks/useDeals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  deal?: DealDto | null;
}

export function DealFormSheet({ open, onOpenChange, pipelineId, deal }: Props) {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(deal);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('VND');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');

  const { data: customerData } = useCustomers({ page: 1, limit: 100 });
  const createMut = useCreateDeal();
  const updateMut = useUpdateDeal(deal?.id ?? '');
  const pending = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    setTitle(deal?.title ?? '');
    setCustomerId(deal?.customerId ?? '');
    setCurrency(deal?.currency ?? 'VND');
    setExpectedCloseDate(deal?.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : '');
  }, [open, deal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || (!isEdit && !customerId)) return;
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ title: title.trim(), currency, expectedCloseDate: expectedCloseDate || null });
        toast.success(t('deal.toast.updated'));
      } else {
        const body: CreateDealRequest = {
          title: title.trim(),
          customerId,
          pipelineId,
          currency,
          expectedCloseDate: expectedCloseDate || undefined,
        };
        await createMut.mutateAsync(body);
        toast.success(t('deal.toast.created'));
      }
      onOpenChange(false);
    } catch {
      toast.error(t('deal.toast.error'));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t(isEdit ? 'deal.form.editTitle' : 'deal.form.createTitle')}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">{t('deal.form.title')} <span className="text-destructive">*</span></Label>
            <Input id="deal-title" className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('deal.form.titlePlaceholder')} required />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>{t('deal.form.customer')} <span className="text-destructive">*</span></Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('deal.form.customerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {customerData?.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-currency">{t('deal.form.currency')}</Label>
              <Input id="deal-currency" className="h-9" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-date">{t('deal.form.expectedCloseDate')}</Label>
              <Input id="deal-date" type="date" className="h-9" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('deal.form.cancel')}</Button>
            <Button type="submit" disabled={pending || !title.trim() || (!isEdit && !customerId)}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(pending ? 'deal.form.saving' : 'deal.form.save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
