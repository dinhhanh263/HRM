import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseRequestDto } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { getApiErrorCode } from '@/lib/api-error';
import { formatVnd } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth.store';
import { FileDown, Loader2 } from 'lucide-react';
import { PurchaseStatusBadge } from './PurchaseStatusBadge';
import { PurchaseTimeline } from './PurchaseTimeline';
import { PurchaseAttachmentUploader } from './PurchaseAttachmentUploader';
import { formatPurchaseDate } from '../utils';
import {
  usePurchaseRequest,
  useApprovePurchaseRequest,
  useRespondPurchaseRequest,
  useCancelPurchaseRequest,
  useMarkOrderedPurchaseRequest,
  downloadPurchasePdf,
} from '../hooks/usePurchaseRequests';

interface DetailSheetProps {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (request: PurchaseRequestDto) => void;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-sm text-text-muted shrink-0">{label}</span>
      <span className="text-sm text-text-primary text-right">{value}</span>
    </div>
  );
}

function currencySymbol(currency: string): string {
  return currency === 'VND' ? '₫' : currency;
}

export function PurchaseRequestDetailSheet({ requestId, onOpenChange, onEdit }: DetailSheetProps) {
  const { t } = useTranslation('purchase');
  const { can } = usePermission();
  const myEmployeeId = useAuthStore((s) => s.user?.employee?.id ?? null);

  const { data: r, isLoading } = usePurchaseRequest(requestId);
  const approveMutation = useApprovePurchaseRequest();
  const respondMutation = useRespondPurchaseRequest();
  const cancelMutation = useCancelPurchaseRequest();
  const markOrderedMutation = useMarkOrderedPurchaseRequest();

  const [respondMode, setRespondMode] = useState<'return' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [orderedOpen, setOrderedOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const isOwner = !!r && !!myEmployeeId && r.employeeId === myEmployeeId;
  const editable = isOwner && (r?.status === 'PENDING' || r?.status === 'RETURNED');
  // Attachments can be added/removed while the request is still "active" — every
  // status except the terminal REJECTED/CANCELLED (mirrors the server guard), so
  // the owner can attach quotes/contracts even after the request is approved.
  const canAttach = isOwner && r?.status !== 'REJECTED' && r?.status !== 'CANCELLED';
  const canReviewNow = !!r && r.status === 'PENDING' && !isOwner;
  const canApprove = canReviewNow && can('purchase_request:approve');
  const canRespond = canReviewNow && can('purchase_request:reject');
  const canMarkOrdered = !!r && r.status === 'APPROVED' && can('purchase_request:mark_ordered');

  const sym = r ? currencySymbol(r.currency) : '₫';

  function handleApprove() {
    if (!r) return;
    approveMutation.mutate(r.id, {
      onSuccess: () => { toast.success(t('toast.approved')); onOpenChange(false); },
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  function submitRespond() {
    if (!r || !respondMode) return;
    if (!note.trim()) { toast.error(t('respond.noteRequired')); return; }
    respondMutation.mutate(
      { id: r.id, mode: respondMode, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(respondMode === 'reject' ? t('toast.rejected') : t('toast.returned'));
          setRespondMode(null); setNote(''); onOpenChange(false);
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function submitMarkOrdered() {
    if (!r) return;
    markOrderedMutation.mutate(
      { id: r.id, orderNote: orderNote.trim() || undefined },
      {
        onSuccess: () => { toast.success(t('toast.ordered')); setOrderedOpen(false); setOrderNote(''); onOpenChange(false); },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function submitCancel() {
    if (!r) return;
    cancelMutation.mutate(r.id, {
      onSuccess: () => { toast.success(t('toast.cancelled')); setCancelOpen(false); onOpenChange(false); },
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  async function handlePdf() {
    if (!r) return;
    setDownloadingPdf(true);
    try {
      await downloadPurchasePdf(r.id, r.code);
    } catch {
      toast.error(t('toast.tryAgain'));
    } finally {
      setDownloadingPdf(false);
    }
  }

  function errMsg(e: unknown): string {
    const code = getApiErrorCode(e);
    return (code && t(`toast.errors.${code}`, { defaultValue: '' })) || t('toast.tryAgain');
  }

  return (
    <Sheet open={!!requestId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
        </SheetHeader>

        {isLoading || !r ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-text-muted tabular-nums">{r.code}</p>
                  <h3 className="text-lg font-semibold text-text-primary">{r.title}</h3>
                </div>
                <PurchaseStatusBadge status={r.status} />
              </div>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                {formatVnd(r.totalAmount)} {sym}
              </p>
            </div>

            {/* Info */}
            <div className="rounded-lg border border-border bg-surface p-4">
              {r.employee && <InfoRow label={t('detail.createdBy')} value={r.employee.fullName} />}
              {r.employee?.departmentName && (
                <InfoRow label={t('detail.department')} value={r.employee.departmentName} />
              )}
              <InfoRow label={t('form.vendorName')} value={r.vendorName} />
              <InfoRow
                label={t('form.issuingEntity')}
                value={r.issuingCompanyName ?? r.issuingEntity?.name ?? null}
              />
              <InfoRow
                label={t('form.expectedDeliveryDate')}
                value={r.expectedDeliveryDate ? formatPurchaseDate(r.expectedDeliveryDate) : null}
              />
              <InfoRow label={t('form.description')} value={r.description} />
              {r.status === 'ORDERED' && (
                <InfoRow
                  label={t('detail.orderNote')}
                  value={`${r.orderedAt ? t('detail.orderedInfo', { date: formatPurchaseDate(r.orderedAt) }) : ''}${r.orderNote ? ` · ${r.orderNote}` : ''}`}
                />
              )}
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">{t('detail.items')}</h4>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-alt/50 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      <th className="px-2 py-2 w-8">#</th>
                      <th className="px-2 py-2">{t('form.items.productName')}</th>
                      <th className="px-2 py-2 w-16">{t('form.items.unit')}</th>
                      <th className="px-2 py-2 w-20 text-right">{t('form.items.quantity')}</th>
                      <th className="px-2 py-2 w-28 text-right">{t('form.items.unitPrice')}</th>
                      <th className="px-2 py-2 w-16 text-right">{t('form.items.taxRate')}</th>
                      <th className="px-2 py-2 w-28 text-right">{t('form.items.lineSubtotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.items ?? []).map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-2 py-2 text-text-muted tabular-nums">{it.lineNo}</td>
                        <td className="px-2 py-2 text-text-primary">
                          <p className="font-medium">{it.productName}</p>
                          {it.sku && <p className="text-xs text-text-muted">{it.sku}</p>}
                        </td>
                        <td className="px-2 py-2 text-text-secondary">{it.unit ?? '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                          {formatVnd(it.quantity)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                          {formatVnd(it.unitPrice)} {sym}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                          {formatVnd(it.taxRate)}%
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium text-text-primary">
                          {formatVnd(it.lineSubtotal)} {sym}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-lg border border-border bg-surface-alt/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{t('form.totals.subtotal')}</span>
                  <span className="tabular-nums text-text-primary">{formatVnd(r.subtotal)} {sym}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{t('form.totals.vat')}</span>
                  <span className="tabular-nums text-text-primary">{formatVnd(r.taxAmount)} {sym}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
                  <span className="text-text-primary">{t('form.totals.total')}</span>
                  <span className="tabular-nums text-text-primary">{formatVnd(r.totalAmount)} {sym}</span>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">{t('detail.attachments')}</h4>
              <PurchaseAttachmentUploader
                requestId={r.id}
                attachments={r.attachments ?? []}
                editable={canAttach}
              />
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">{t('detail.timeline')}</h4>
              <PurchaseTimeline approvals={r.approvals ?? []} currentStep={r.currentStep} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {canApprove && (
                <Button onClick={handleApprove} disabled={approveMutation.isPending}>
                  {t('actions.approve')}
                </Button>
              )}
              {canRespond && (
                <>
                  <Button variant="outline" onClick={() => { setRespondMode('return'); setNote(''); }}>
                    {t('actions.return')}
                  </Button>
                  <Button variant="outline" className="text-danger hover:text-danger" onClick={() => { setRespondMode('reject'); setNote(''); }}>
                    {t('actions.reject')}
                  </Button>
                </>
              )}
              {canMarkOrdered && (
                <Button onClick={() => { setOrderedOpen(true); setOrderNote(''); }}>
                  {t('actions.markOrdered')}
                </Button>
              )}
              {isOwner && r.status === 'RETURNED' && (
                <Button onClick={() => onEdit(r)}>{t('actions.resubmit')}</Button>
              )}
              {editable && (
                <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setCancelOpen(true)}>
                  {t('actions.cancelRequest')}
                </Button>
              )}
              <Button variant="outline" onClick={handlePdf} disabled={downloadingPdf}>
                {downloadingPdf ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 size-4" />
                )}
                {t('actions.exportPdf')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Respond (return/reject) dialog */}
      <Dialog open={!!respondMode} onOpenChange={(o) => !o && setRespondMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{respondMode === 'reject' ? t('respond.rejectTitle') : t('respond.returnTitle')}</DialogTitle>
            <DialogDescription>
              {respondMode === 'reject' ? t('respond.rejectDescription') : t('respond.returnDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="respond-note">{t('respond.noteLabel')} <span className="text-danger">*</span></Label>
            <Textarea id="respond-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('respond.notePlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondMode(null)}>{t('actions.cancel')}</Button>
            <Button
              className={respondMode === 'reject' ? 'bg-danger hover:bg-danger/90' : undefined}
              disabled={respondMutation.isPending}
              onClick={submitRespond}
            >
              {respondMode === 'reject' ? t('actions.reject') : t('actions.return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark ordered dialog */}
      <Dialog open={orderedOpen} onOpenChange={setOrderedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('markOrdered.title')}</DialogTitle>
            <DialogDescription>{t('markOrdered.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="order-note">{t('markOrdered.noteLabel')}</Label>
            <Textarea id="order-note" rows={2} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder={t('markOrdered.notePlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderedOpen(false)}>{t('actions.cancel')}</Button>
            <Button disabled={markOrderedMutation.isPending} onClick={submitMarkOrdered}>{t('actions.markOrdered')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cancelConfirm.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={submitCancel}>
              {t('actions.cancelRequest')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
