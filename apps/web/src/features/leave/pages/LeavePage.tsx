import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeaveStatus, LeaveRequestDto, CreateLeaveRequestRequest } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { Plus, AlertTriangle } from 'lucide-react';
import {
  useLeaveTypes,
  useLeaveBalances,
  useLeaveRequests,
  useCreateLeaveRequest,
  useResubmitLeaveRequest,
  useCancelLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
} from '../hooks/useLeave';
import { LeaveBalanceCards } from '../components/LeaveBalanceCards';
import { LeaveRequestTable } from '../components/LeaveRequestTable';
import { LeaveRequestForm } from '../components/LeaveRequestForm';
import { LeaveRequestDetailSheet } from '../components/LeaveRequestDetailSheet';
import { LeaveTypeSettings } from '../components/LeaveTypeSettings';
import { LeaveSettingsCard } from '../components/LeaveSettingsCard';
import { ApprovalFlowSettings } from '../components/ApprovalFlowSettings';
import { RejectDialog } from '../components/RejectDialog';

type Tab = 'mine' | 'review' | 'all' | 'watching' | 'settings' | 'flows';

export function LeavePage() {
  const { t } = useTranslation('leave');
  const { can } = usePermission();
  const year = new Date().getUTCFullYear();

  const canReview = can('leave:approve') || can('leave:reject');
  const canConfigure = can('leave:configure');

  const [tab, setTab] = useState<Tab>(canReview ? 'review' : 'mine');
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<LeaveRequestDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestDto | null>(null);

  const isListTab = tab === 'mine' || tab === 'review' || tab === 'all' || tab === 'watching';
  const listMode: 'mine' | 'review' | 'all' | 'watching' =
    tab === 'review' ? 'review' : tab === 'all' ? 'all' : tab === 'watching' ? 'watching' : 'mine';

  // SPEC-046: the "Watching" (CC) tab is only relevant to users who actually
  // watch at least one request. Probe cheaply so plain employees never see an
  // always-empty tab, but keep it visible while the tab is active.
  const { data: watchingProbe } = useLeaveRequests({ scope: 'watching', year });
  const hasWatching = (watchingProbe?.pagination?.total ?? 0) > 0;

  // The Approvals (review) tab is a to-do queue of requests awaiting *your*
  // decision — once you act, the request leaves the queue. A status filter is
  // meaningless there (the backend only returns PENDING), so hide it and never
  // send a status for this scope. Browse decided requests under All Requests.
  const showStatusFilter = tab !== 'review';

  const { data: activeTypes } = useLeaveTypes(true);
  const { data: balances, isLoading: balancesLoading } = useLeaveBalances(year);

  const requestFilters = useMemo(
    () => ({ scope: listMode, status: showStatusFilter ? statusFilter : undefined, year }),
    [listMode, showStatusFilter, statusFilter, year]
  );
  const {
    data: requestsData,
    isLoading: requestsLoading,
    error: requestsError,
  } = useLeaveRequests(isListTab ? requestFilters : {});

  const createMutation = useCreateLeaveRequest();
  const resubmitMutation = useResubmitLeaveRequest();
  const cancelMutation = useCancelLeaveRequest();
  const approveMutation = useApproveLeaveRequest();
  const rejectMutation = useRejectLeaveRequest();

  // Surface the real server reason (overlap, insufficient balance, …) instead of
  // a generic "try again" toast. Known business codes get a translated message;
  // anything else falls back to the server message, then the generic copy.
  function describeCreateError(error: unknown): string {
    const code = getApiErrorCode(error);
    if (code) {
      const translated = t(`toast.createErrors.${code}`, { defaultValue: '' });
      if (translated) return translated;
    }
    return getApiErrorMessage(error, t('toast.tryAgain'));
  }

  function handleFormSubmit(data: CreateLeaveRequestRequest) {
    if (resubmitTarget) {
      resubmitMutation.mutate(
        { id: resubmitTarget.id, data },
        {
          onSuccess: () => {
            toast.success(t('toast.resubmitted'));
            setFormOpen(false);
            setResubmitTarget(null);
          },
          onError: (error) =>
            toast.error(t('toast.resubmitError'), { description: describeCreateError(error) }),
        }
      );
      return;
    }
    createMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('toast.created'));
        setFormOpen(false);
      },
      onError: (error) =>
        toast.error(t('toast.createError'), { description: describeCreateError(error) }),
    });
  }

  function openResubmit(req: LeaveRequestDto) {
    setDetailId(null);
    setResubmitTarget(req);
    setFormOpen(true);
  }

  function handleFormOpenChange(open: boolean) {
    setFormOpen(open);
    if (!open) setResubmitTarget(null);
  }

  function handleCancelConfirm() {
    if (!cancelId) return;
    cancelMutation.mutate(cancelId, {
      onSuccess: () => {
        toast.success(t('toast.cancelled'));
        setCancelId(null);
      },
      onError: () => {
        toast.error(t('toast.cancelError'), { description: t('toast.tryAgain') });
        setCancelId(null);
      },
    });
  }

  function handleApprove(id: string) {
    approveMutation.mutate(id, {
      onSuccess: () => {
        toast.success(t('toast.approved'));
        setDetailId(null);
      },
      onError: () => toast.error(t('toast.approveError'), { description: t('toast.tryAgain') }),
    });
  }

  function handleRejectConfirm(note: string) {
    if (!rejectTarget) return;
    rejectMutation.mutate(
      { id: rejectTarget.id, note: note || undefined },
      {
        onSuccess: () => {
          toast.success(t('toast.returned'));
          setRejectTarget(null);
          setDetailId(null);
        },
        onError: (error) => {
          toast.error(t('toast.rejectError'), { description: describeCreateError(error) });
          setRejectTarget(null);
        },
      }
    );
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'mine', label: t('tabs.mine'), show: true },
    { key: 'review', label: t('tabs.review'), show: canReview },
    { key: 'all', label: t('tabs.all'), show: canReview },
    { key: 'watching', label: t('tabs.watching'), show: hasWatching || tab === 'watching' },
    { key: 'settings', label: t('tabs.settings'), show: canConfigure },
    { key: 'flows', label: t('tabs.flows'), show: canConfigure },
  ];

  const busyId =
    cancelMutation.isPending
      ? cancelId
      : approveMutation.isPending
        ? approveMutation.variables ?? null
        : null;

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
        </div>
        <Can permission="leave:create">
          <Button
            onClick={() => {
              setResubmitTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('requests.newRequest')}
          </Button>
        </Can>
      </div>

      {/* Balance cards (own balances) */}
      <LeaveBalanceCards balances={balances || []} isLoading={balancesLoading} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs
          .filter((tb) => tb.show)
          .map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'px-4 h-9 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === tb.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              )}
            >
              {tb.label}
            </button>
          ))}
      </div>

      {/* Tab content */}
      {tab === 'settings' ? (
        <div className="space-y-4">
          <LeaveSettingsCard />
          <LeaveTypeSettings />
        </div>
      ) : tab === 'flows' ? (
        <ApprovalFlowSettings />
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
            {showStatusFilter ? (
              <Select
                value={statusFilter || 'all'}
                onValueChange={(v) =>
                  setStatusFilter(v === 'all' ? undefined : (v as LeaveStatus))
                }
              >
                <SelectTrigger className="h-8 text-xs w-[150px]">
                  <SelectValue placeholder={t('requests.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('requests.allStatuses')}</SelectItem>
                  <SelectItem value="PENDING">{t('status.PENDING')}</SelectItem>
                  <SelectItem value="APPROVED">{t('status.APPROVED')}</SelectItem>
                  <SelectItem value="RETURNED">{t('status.RETURNED')}</SelectItem>
                  <SelectItem value="REJECTED">{t('status.REJECTED')}</SelectItem>
                  <SelectItem value="CANCELLED">{t('status.CANCELLED')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              // Keep the count right-aligned when the status filter is hidden.
              <span aria-hidden />
            )}
            {requestsData?.pagination && (
              <p className="text-xs text-text-muted shrink-0 tabular-nums">
                <span className="font-medium text-text-primary">
                  {requestsData.pagination.total}
                </span>
              </p>
            )}
          </div>

          {/* Content */}
          {requestsLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <Skeleton className="h-3.5 w-1/3 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : requestsError ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
                <AlertTriangle className="size-5 text-danger" />
              </div>
              <p className="text-text-primary font-medium">{t('states.error', { ns: 'common' })}</p>
              <p className="text-text-muted text-sm mt-1">{t('requests.loadError')}</p>
            </div>
          ) : (
            <LeaveRequestTable
              requests={requestsData?.data || []}
              mode={listMode}
              onCancel={(id) => setCancelId(id)}
              onApprove={handleApprove}
              onReject={(req) => setRejectTarget(req)}
              onResubmit={openResubmit}
              onRowClick={(req) => setDetailId(req.id)}
              pendingId={busyId}
            />
          )}
        </div>
      )}

      {/* Request form (create + resubmit) */}
      <LeaveRequestForm
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        leaveTypes={activeTypes || []}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || resubmitMutation.isPending}
        initialRequest={resubmitTarget}
      />

      {/* Request detail + timeline */}
      <LeaveRequestDetailSheet
        requestId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        mode={listMode}
        onApprove={handleApprove}
        onReject={(req) => setRejectTarget(req)}
        onCancel={(id) => setCancelId(id)}
        onResubmit={openResubmit}
        isActing={approveMutation.isPending || rejectMutation.isPending}
      />

      {/* Reject dialog */}
      <RejectDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
        isSubmitting={rejectMutation.isPending}
      />

      {/* Cancel confirm */}
      <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cancelDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={cancelMutation.isPending}
            >
              {t('cancelDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
