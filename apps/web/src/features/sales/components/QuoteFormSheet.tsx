import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { QuoteDto, QuoteItemInput } from '@hrm/shared';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProducts } from '../hooks/useProducts';
import { useCreateQuote, useUpdateQuote } from '../hooks/useQuotes';

interface Row {
  productId: string; // '' = free text
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
}
const FREE = '__free__';
const emptyRow = (): Row => ({ productId: FREE, description: '', quantity: '1', unitPrice: '0', discountPct: '0' });

function lineTotal(r: Row): number {
  return Math.round(Number(r.quantity) * Number(r.unitPrice) * (1 - Number(r.discountPct) / 100) * 100) / 100;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealId: string;
  quote?: QuoteDto | null;
}

export function QuoteFormSheet({ open, onOpenChange, dealId, quote }: Props) {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(quote);
  const { data: products } = useProducts('', true);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [isPrimary, setIsPrimary] = useState(true);

  const createMut = useCreateQuote(dealId);
  const updateMut = useUpdateQuote(quote?.id ?? '');
  const pending = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    if (quote) {
      setRows(quote.items.map((it) => ({ productId: it.productId ?? FREE, description: it.description ?? '', quantity: it.quantity, unitPrice: it.unitPrice, discountPct: it.discountPct })));
      setIsPrimary(quote.isPrimary);
    } else {
      setRows([emptyRow()]);
      setIsPrimary(true);
    }
  }, [open, quote]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + lineTotal(r), 0);

  function onPickProduct(i: number, productId: string) {
    if (productId === FREE) { setRow(i, { productId: FREE }); return; }
    const p = products?.items.find((x) => x.id === productId);
    setRow(i, { productId, unitPrice: p?.unitPrice ?? '0', description: p?.name ?? '' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const items: QuoteItemInput[] = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.productId === FREE ? null : r.productId,
        description: r.description || undefined,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unitPrice),
        discountPct: Number(r.discountPct) || 0,
      }));
    if (items.length === 0) return;
    try {
      if (isEdit) { await updateMut.mutateAsync({ items, isPrimary }); toast.success(t('quote.toast.updated')); }
      else { await createMut.mutateAsync({ items, isPrimary }); toast.success(t('quote.toast.created')); }
      onOpenChange(false);
    } catch { toast.error(t('quote.toast.error')); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[640px] overflow-y-auto">
        <SheetHeader><SheetTitle>{t(isEdit ? 'quote.form.editTitle' : 'quote.form.createTitle')}</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>{t('quote.form.items')}</Label>
            {rows.map((r, i) => (
              <div key={i} className="rounded-md border border-border p-2.5 space-y-2">
                <div className="flex gap-2">
                  <Select value={r.productId} onValueChange={(v) => onPickProduct(i, v)}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FREE}>{t('quote.form.freeText')}</SelectItem>
                      {products?.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-danger shrink-0" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Input className="h-8 text-xs" placeholder={t('quote.form.description')} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} />
                <div className="grid grid-cols-4 gap-2">
                  <div><Label className="text-[10px] text-text-muted">{t('quote.form.qty')}</Label><Input className="h-8 text-xs tabular-nums" type="number" min={0} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} /></div>
                  <div className="col-span-2"><Label className="text-[10px] text-text-muted">{t('quote.form.unitPrice')}</Label><Input className="h-8 text-xs tabular-nums" type="number" min={0} value={r.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} /></div>
                  <div><Label className="text-[10px] text-text-muted">{t('quote.form.discount')}</Label><Input className="h-8 text-xs tabular-nums" type="number" min={0} max={100} value={r.discountPct} onChange={(e) => setRow(i, { discountPct: e.target.value })} /></div>
                </div>
                <p className="text-right text-xs text-text-secondary tabular-nums">{t('quote.form.lineTotal')}: <span className="font-medium text-text-primary">{lineTotal(r).toLocaleString('vi-VN')}</span></p>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
              <Plus size={14} className="mr-1.5" />{t('quote.form.addItem')}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md bg-surface-alt/50 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
              {t('quote.form.isPrimary')}
            </label>
            <span className="text-sm font-semibold tabular-nums">{t('quote.total')}: {total.toLocaleString('vi-VN')}</span>
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('quote.form.cancel')}</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(pending ? 'quote.form.saving' : 'quote.form.save')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
