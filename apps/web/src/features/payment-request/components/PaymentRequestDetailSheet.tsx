import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentRequestDto } from '@hrm/shared';
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
import { AlertTriangle } from 'lucide-react';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { PaymentTimeline } from './PaymentTimeline';
import { PaymentAttachmentUploader } from './PaymentAttachmentUploader';
import { formatPaymentDate } from '../utils';
import {
  usePaymentRequest,
  useApprovePaymentRequest,
  useRespondPaymentRequest,
  useCancelPaymentRequest,
  useMarkPaidPaymentRequest,
} from '../hooks/usePaymentRequests';

interface DetailSheetProps {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (request: PaymentRequestDto) => void;
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

export function PaymentRequestDetailSheet({ requestId, onOpenChange, onEdit }: DetailSheetProps) {
  const { t } = useTranslation('payment');
  const { can } = usePermission();
  const myEmployeeId = useAuthStore((s) => s.user?.employee?.id ?? null);

  const { data: r, isLoading } = usePaymentRequest(requestId);
  const approveMutation = useApprovePaymentRequest();
  const respondMutation = useRespondPaymentRequest();
  const cancelMutation = useCancelPaymentRequest();
  const markPaidMutation = useMarkPaidPaymentRequest();

  const [respondMode, setRespondMode] = useState<'return' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [paidOpen, setPaidOpen] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const isOwner = !!r && !!myEmployeeId && r.employeeId === myEmployeeId;
  const editable = isOwner && (r?.status === 'PENDING' || r?.status === 'RETURNED');
  const canReviewNow = !!r && r.status === 'PENDING' && !isOwner;
  const canApprove = canReviewNow && can('payment_request:approve');
  const canRespond = canReviewNow && can('payment_request:reject');
  const canMarkPaid = !!r && r.status === 'APPROVED' && can('payment_request:mark_paid');

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

  function submitMarkPaid() {
    if (!r) return;
    markPaidMutation.mutate(
      { id: r.id, paymentNote: paymentNote.trim() || undefined },
      {
        onSuccess: () => { toast.success(t('toast.paid')); setPaidOpen(false); setPaymentNote(''); onOpenChange(false); },
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

  function errMsg(e: unknown): string {
    const code = getApiErrorCode(e);
    return (code && t(`toast.errors.${code}`, { defaultValue: '' })) || t('toast.tryAgain');
  }

  return (
    <Sheet open={!!requestId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
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
                <h3 className="text-lg font-semibold text-text-primary">{r.title}</h3>
                <PaymentStatusBadge status={r.status} />
              </div>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                {formatVnd(r.amount)} {r.currency === 'VND' ? '₫' : r.currency}
              </p>
            </div>

            {/* Info */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <InfoRow label={t('table.type')} value={t(`type.${r.type}`)} />
              {r.employee && <InfoRow label={t('detail.createdBy')} value={r.employee.fullName} />}
              <InfoRow label={t('form.expenseDate')} value={r.expenseDate ? formatPaymentDate(r.expenseDate) : null} />
              <InfoRow label={t('form.category')} value={r.category} />
              <InfoRow label={t('form.neededByDate')} value={r.neededByDate ? formatPaymentDate(r.neededByDate) : null} />
              <InfoRow label={t('form.vendorName')} value={r.vendorName} />
              <InfoRow label={t('form.invoiceNumber')} value={r.invoiceNumber} />
              <InfoRow label={t('form.dueDate')} value={r.dueDate ? formatPaymentDate(r.dueDate) : null} />
              <InfoRow label={t('form.description')} value={r.description} />
              {r.status === 'PAID' && (
                <InfoRow
                  label={t('detail.paymentNote')}
                  value={`${r.paidAt ? t('detail.paidInfo', { date: formatPaymentDate(r.paidAt) }) : ''}${r.paymentNote ? ` · ${r.paymentNote}` : ''}`}
                />
              )}
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">{t('detail.attachments')}</h4>
              {(r.type === 'REIMBURSEMENT' || r.type === 'VENDOR_PAYMENT') &&
                (r.attachments?.length ?? 0) === 0 && (
                  <p className="text-xs text-warning flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    {t('detail.noAttachmentsWarning')}
                  </p>
                )}
              <PaymentAttachmentUploader
                requestId={r.id}
                attachments={r.attachments ?? []}
                editable={!!editable}
              />
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary">{t('detail.timeline')}</h4>
              <PaymentTimeline approvals={r.approvals ?? []} currentStep={r.currentStep} />
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
              {canMarkPaid && (
                <Button onClick={() => { setPaidOpen(true); setPaymentNote(''); }}>
                  {t('actions.markPaid')}
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

      {/* Mark paid dialog */}
      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('markPaid.title')}</DialogTitle>
            <DialogDescription>{t('markPaid.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="paid-note">{t('markPaid.noteLabel')}</Label>
            <Textarea id="paid-note" rows={2} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder={t('markPaid.notePlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)}>{t('actions.cancel')}</Button>
            <Button disabled={markPaidMutation.isPending} onClick={submitMarkPaid}>{t('actions.markPaid')}</Button>
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
