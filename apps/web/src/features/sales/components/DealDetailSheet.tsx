import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, FileDown, Trash2, Star, Trophy, X as XIcon } from 'lucide-react';
import type { DealDto, QuoteDto } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useQuotes, useDeleteQuote, downloadQuotePdf } from '../hooks/useQuotes';
import { useWinDeal, useLoseDeal } from '../hooks/useDeals';
import { QuoteFormSheet } from './QuoteFormSheet';
import { LoseDealDialog } from './LoseDealDialog';

function money(v: string, c: string) {
  try { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)); }
  catch { return `${Number(v).toLocaleString('vi-VN')} ${c}`; }
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: DealDto | null;
}

export function DealDetailSheet({ open, onOpenChange, deal }: Props) {
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const { data: quotes } = useQuotes(deal?.id, open);
  const deleteQuote = useDeleteQuote();
  const winMut = useWinDeal();
  const loseMut = useLoseDeal();
  const [quoteForm, setQuoteForm] = useState<{ open: boolean; quote: QuoteDto | null }>({ open: false, quote: null });
  const [loseOpen, setLoseOpen] = useState(false);

  if (!deal) return null;
  const canQuote = can('sales:quote_manage');
  const canMove = can('sales:deal_move');
  const isOpen = deal.status === 'OPEN';

  async function win() {
    try { await winMut.mutateAsync(deal!.id); toast.success(t('deal.toast.won')); onOpenChange(false); }
    catch { toast.error(t('deal.toast.error')); }
  }
  async function lose(reason: string) {
    try { await loseMut.mutateAsync({ id: deal!.id, lostReason: reason }); toast.success(t('deal.toast.lost')); setLoseOpen(false); onOpenChange(false); }
    catch { toast.error(t('deal.toast.error')); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[640px] overflow-y-auto">
        <SheetHeader><SheetTitle>{deal.title}</SheetTitle></SheetHeader>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label={t('dealDetail.customer')} value={deal.customer?.fullName ?? '—'} />
          <Field label={t('dealDetail.stage')} value={deal.stage?.name ?? '—'} />
          <Field label={t('dealDetail.amount')} value={money(deal.amount, deal.currency)} />
          <Field label={t('dealDetail.owner')} value={deal.owner?.fullName ?? '—'} />
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide">{t('dealDetail.status')}</p>
            <Badge variant="outline" className={cn('mt-1 text-xs',
              deal.status === 'WON' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
              : deal.status === 'LOST' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800')}>
              {t(`deal.status.${deal.status}`)}
            </Badge>
          </div>
        </div>

        {canMove && isOpen && (
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={win} disabled={winMut.isPending}><Trophy size={14} className="mr-1.5" />{t('deal.win')}</Button>
            <Button size="sm" variant="outline" className="text-danger" onClick={() => setLoseOpen(true)}><XIcon size={14} className="mr-1.5" />{t('deal.lose')}</Button>
          </div>
        )}

        {/* Quotes */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{t('quote.tab')}</h3>
            {canQuote && <Button size="sm" variant="outline" onClick={() => setQuoteForm({ open: true, quote: null })}><Plus size={14} className="mr-1.5" />{t('quote.add')}</Button>}
          </div>
          {!quotes || quotes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-text-muted">{t('quote.empty')}</p>
          ) : (
            <div className="space-y-2">
              {quotes.map((q) => (
                <div key={q.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{q.code}</span>
                      {q.isPrimary && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20"><Star size={9} className="mr-0.5" />{t('quote.primary')}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{t(`quote.status.${q.status}`)}</Badge>
                    </div>
                    <p className="text-sm font-semibold text-primary tabular-nums">{money(q.total, 'VND')}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title={t('quote.pdf')} onClick={() => downloadQuotePdf(q.id, q.code)}><FileDown size={14} /></Button>
                  {canQuote && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQuoteForm({ open: true, quote: q })}>{t('quote.form.editTitle')}</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => deleteQuote.mutate(q.id)}><Trash2 size={14} /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canQuote && <QuoteFormSheet open={quoteForm.open} onOpenChange={(o) => setQuoteForm((s) => ({ ...s, open: o }))} dealId={deal.id} quote={quoteForm.quote} />}
        <LoseDealDialog open={loseOpen} onOpenChange={setLoseOpen} pending={loseMut.isPending} onConfirm={lose} />
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-text-primary">{value}</p>
    </div>
  );
}
