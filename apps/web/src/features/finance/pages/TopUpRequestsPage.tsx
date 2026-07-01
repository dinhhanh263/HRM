import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TopUpRequestDto, TopUpStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermission } from '@/hooks/usePermission';
import { formatVnd } from '@/lib/utils';
import { Plus, Check, X, Ban, Eye, Coins } from 'lucide-react';
import { useFundAccounts } from '../hooks/useFundAccounts';
import {
  useTopUpRequests,
  useCreateTopUpRequest,
  useCancelTopUpRequest,
  useReviewTopUpRequest,
} from '../hooks/useTopUpRequests';
import { TopUpRequestFormSheet } from '../components/TopUpRequestFormSheet';

const STATUS_CLASS: Record<TopUpStatus, string> = {
  PENDING: 'bg-warning-light text-warning',
  APPROVED: 'bg-success-light text-success',
  REJECTED: 'bg-danger-light text-danger',
  CANCELLED: 'bg-surface-alt text-text-muted',
};

function StatusBadge({ status }: { status: TopUpStatus }) {
  const { t } = useTranslation('finance');
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>{t(`topup.status.${status}`)}</span>;
}

const NONE = '__none__';

export function TopUpRequestsPage() {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canReview = can('topup_request:approve');
  const canCreate = can('topup_request:create');

  const { data = [], isLoading } = useTopUpRequests();
  const { data: accounts = [] } = useFundAccounts({ active: true });
  const createMutation = useCreateTopUpRequest();
  const cancelMutation = useCancelTopUpRequest();
  const reviewMutation = useReviewTopUpRequest();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<TopUpRequestDto | null>(null);
  const [approveTarget, setApproveTarget] = useState<TopUpRequestDto | null>(null);
  const [fundedAccountId, setFundedAccountId] = useState<string>(NONE);
  const [rejectTarget, setRejectTarget] = useState<TopUpRequestDto | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  function handleCreate(payload: Parameters<typeof createMutation.mutate>[0]) {
    createMutation.mutate(payload, {
      onSuccess: () => { toast.success(t('topup.toast.created')); setSheetOpen(false); },
      onError: () => toast.error(t('topup.toast.saveError')),
    });
  }
  function confirmApprove() {
    if (!approveTarget) return;
    reviewMutation.mutate(
      { id: approveTarget.id, decision: 'APPROVED', fundedAccountId: fundedAccountId === NONE ? null : fundedAccountId },
      {
        onSuccess: () => { toast.success(t('topup.toast.approved')); setApproveTarget(null); setFundedAccountId(NONE); },
        onError: () => toast.error(t('topup.toast.reviewError')),
      },
    );
  }
  function confirmReject() {
    if (!rejectTarget || !rejectNote.trim()) return;
    reviewMutation.mutate(
      { id: rejectTarget.id, decision: 'REJECTED', note: rejectNote.trim() },
      {
        onSuccess: () => { toast.success(t('topup.toast.rejected')); setRejectTarget(null); setRejectNote(''); },
        onError: () => toast.error(t('topup.toast.reviewError')),
      },
    );
  }
  function cancel(r: TopUpRequestDto) {
    cancelMutation.mutate(r.id, {
      onSuccess: () => toast.success(t('topup.toast.cancelled')),
      onError: () => toast.error(t('topup.toast.saveError')),
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('topup.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('topup.subtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />{t('topup.form.create')}
          </Button>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4"><Coins className="w-8 h-8 text-text-muted" /></div>
            <p className="text-text-primary font-medium">{t('topup.empty.title')}</p>
            <p className="text-text-muted text-sm mt-2">{t('topup.empty.description')}</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-border border-b-2 border-border-strong">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider">{t('topup.table.title')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[170px]">{t('topup.table.requester')}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[150px]">{t('topup.table.amount')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[120px]">{t('topup.table.status')}</th>
                <th className="px-4 py-3 w-[240px]" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-surface-alt bg-surface">
                  <td className="px-4 py-3 border-b border-border">
                    <span className="font-medium text-text-primary">{r.title}</span>
                    <span className="block text-xs text-text-muted">{r.issuingEntityName}{r.neededByDate ? ` · ${t('topup.table.neededBy')} ${r.neededByDate.slice(0, 10).split('-').reverse().join('/')}` : ''}</span>
                  </td>
                  <td className="px-4 py-3 border-b border-border">
                    <span className="text-text-primary">{r.createdByName ?? '—'}</span>
                    {r.createdByEmail && <span className="block text-xs text-text-muted truncate">{r.createdByEmail}</span>}
                  </td>
                  <td className="px-4 py-3 border-b border-border text-right font-semibold tabular-nums text-text-primary">{formatVnd(r.amount)}</td>
                  <td className="px-4 py-3 border-b border-border"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(r)}><Eye className="size-3.5 mr-1" />{t('topup.actions.detail')}</Button>
                      {r.status === 'PENDING' && canReview && (
                        <>
                          <Button size="sm" className="h-8" onClick={() => { setApproveTarget(r); setFundedAccountId(NONE); }}><Check className="size-3.5 mr-1" />{t('topup.actions.approve')}</Button>
                          <Button variant="outline" size="sm" className="h-8 text-danger" onClick={() => { setRejectTarget(r); setRejectNote(''); }}><X className="size-3.5 mr-1" />{t('topup.actions.reject')}</Button>
                        </>
                      )}
                      {r.status === 'PENDING' && !canReview && canCreate && (
                        <Button variant="outline" size="sm" className="h-8" onClick={() => cancel(r)}><Ban className="size-3.5 mr-1" />{t('topup.actions.cancel')}</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create */}
      <TopUpRequestFormSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={handleCreate} isLoading={createMutation.isPending} />

      {/* Detail */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.title}</SheetTitle>
            <SheetDescription>{detail?.issuingEntityName} · {formatVnd(detail?.amount)}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="mt-6 space-y-3">
              <div className="rounded-lg bg-surface-alt px-3 py-2">
                <span className="text-xs text-text-muted">{t('topup.requestedBy')}</span>
                <p className="text-sm font-medium text-text-primary">{detail.createdByName ?? '—'}{detail.createdByEmail && <span className="font-normal text-text-muted"> · {detail.createdByEmail}</span>}</p>
              </div>
              <div>
                <span className="text-xs text-text-muted">{t('topup.form.justification')}</span>
                <p className="text-sm text-text-primary whitespace-pre-line mt-1">{detail.justification}</p>
              </div>
              {detail.status === 'REJECTED' && detail.reviewNote && <p className="text-sm text-danger">↩ {detail.reviewNote}</p>}
              {detail.status === 'APPROVED' && detail.fundedAccountName && (
                <p className="text-sm text-success">✓ {t('topup.fundedInto', { account: detail.fundedAccountName })}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Approve (Founder) — optionally pick the account to fund */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('topup.approve.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('topup.approve.description', { amount: formatVnd(approveTarget?.amount) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('topup.approve.accountLabel')}</label>
            <Select value={fundedAccountId} onValueChange={setFundedAccountId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('topup.approve.noFund')}</SelectItem>
                {accounts.filter((a) => a.issuingEntityId === approveTarget?.issuingEntityId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({formatVnd(a.currentBalance)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">{t('topup.approve.hint')}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove} disabled={reviewMutation.isPending}>{t('topup.actions.approve')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject (Founder) */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('topup.reject.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('topup.reject.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t('topup.reject.placeholder')} />
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReject} disabled={!rejectNote.trim() || reviewMutation.isPending} className="bg-danger hover:bg-danger/90 text-white">{t('topup.actions.reject')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
