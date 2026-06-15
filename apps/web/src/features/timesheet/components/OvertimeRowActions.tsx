import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Loader2, RotateCcw, X } from 'lucide-react';
import type { OvertimeCapWarning, OvertimeRequestDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
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
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  useApproveOvertime,
  useRejectOvertime,
  useCancelOvertime,
  useOvertimeRequest,
} from '../hooks/useOvertime';
import { OvertimeTimeline } from './OvertimeTimeline';
import { OvertimeSheet } from './OvertimeSheet';
import { getApiErrorMessage } from '@/lib/api-error';

interface OvertimeRowActionsProps {
  record: OvertimeRequestDto;
  // 'review' = manager/HR approve+reject; 'mine' = owner cancel/resubmit.
  mode: 'review' | 'mine';
}

export function OvertimeRowActions({ record, mode }: OvertimeRowActionsProps) {
  const { t } = useTranslation('timesheet');
  const approve = useApproveOvertime();
  const reject = useRejectOvertime();
  const cancel = useCancelOvertime();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [note, setNote] = useState('');

  // Multi-step requests carry an approval timeline; legacy single-step (flowId null) do not.
  const hasTimeline = !!record.flowId;
  const detail = useOvertimeRequest(timelineOpen ? record.id : '');

  // Returning (multi-step) vs rejecting (legacy single-step) share the reject mutation.
  const isReturn = !!record.flowId;

  function warningLine(w: OvertimeCapWarning): string {
    return t(`overtime.review.cap.${w.scope}`, { total: w.total, limit: w.limit });
  }

  function doApprove() {
    approve.mutate(record.id, {
      onSuccess: (result) => {
        if (result.warnings.length > 0) {
          toast.warning(t('overtime.review.capTitle'), {
            description: result.warnings.map(warningLine).join(' · '),
          });
        } else {
          toast.success(t('overtime.review.approved'));
        }
      },
      onError: (err) =>
        toast.error(t('overtime.review.actionError'), { description: getApiErrorMessage(err, t('toast.tryAgain')) }),
    });
  }

  function doReject() {
    if (note.trim().length === 0) return;
    reject.mutate(
      { id: record.id, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(t(isReturn ? 'overtime.review.returned' : 'overtime.review.rejected'));
          setRejectOpen(false);
          setNote('');
        },
        onError: (err) =>
          toast.error(t('overtime.review.actionError'), { description: getApiErrorMessage(err, t('toast.tryAgain')) }),
      },
    );
  }

  function doCancel() {
    cancel.mutate(record.id, {
      onSuccess: () => {
        toast.success(t('overtime.review.cancelled'));
        setCancelOpen(false);
      },
      onError: (err) =>
        toast.error(t('overtime.review.actionError'), { description: getApiErrorMessage(err, t('toast.tryAgain')) }),
    });
  }

  const timelineButton = hasTimeline && (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-text-muted hover:text-text-primary"
      onClick={() => setTimelineOpen(true)}
    >
      <Clock className="size-3.5" />
      {t('overtime.review.timeline')}
    </Button>
  );

  const timelineDialog = (
    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('overtime.review.timelineTitle')}</DialogTitle>
          <DialogDescription>{t('overtime.review.timelineDesc')}</DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (
          <OvertimeTimeline
            approvals={detail.data?.approvals ?? []}
            currentStep={detail.data?.currentStep ?? 0}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  if (mode === 'mine') {
    return (
      <div className="flex items-center justify-end gap-1">
        {timelineButton}
        {record.status === 'RETURNED' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-primary hover:bg-primary/5"
            onClick={() => setResubmitOpen(true)}
          >
            <RotateCcw className="size-3.5" />
            {t('overtime.review.resubmit')}
          </Button>
        )}
        {record.status === 'PENDING' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-text-muted hover:text-danger"
            onClick={() => setCancelOpen(true)}
          >
            <X className="size-3.5" />
            {t('overtime.review.cancel')}
          </Button>
        )}
        {!timelineButton && record.status !== 'RETURNED' && record.status !== 'PENDING' && (
          <span className="text-text-muted">—</span>
        )}

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('overtime.review.cancelTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('overtime.review.cancelDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.back', { ns: 'common' })}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-danger hover:bg-danger/90"
                disabled={cancel.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  doCancel();
                }}
              >
                {cancel.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t('overtime.review.cancelConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <OvertimeSheet open={resubmitOpen} onOpenChange={setResubmitOpen} resubmitTarget={record} />
        {timelineDialog}
      </div>
    );
  }

  // review mode
  return (
    <div className="flex items-center justify-end gap-1">
      {timelineButton}
      {record.status === 'PENDING' ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40"
            disabled={approve.isPending}
            onClick={doApprove}
          >
            {approve.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t('overtime.review.approve')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-text-muted hover:text-danger"
            onClick={() => setRejectOpen(true)}
          >
            <X className="size-3.5" />
            {t(isReturn ? 'overtime.review.return' : 'overtime.review.reject')}
          </Button>
        </>
      ) : (
        !timelineButton && <span className="text-text-muted">—</span>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t(isReturn ? 'overtime.review.returnTitle' : 'overtime.review.rejectTitle')}
            </DialogTitle>
            <DialogDescription>
              {t(isReturn ? 'overtime.review.returnDesc' : 'overtime.review.rejectDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ot-reject-note" className="text-sm font-medium">
              {t('overtime.review.rejectNote')} <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="ot-reject-note"
              maxLength={500}
              placeholder={t('overtime.review.rejectPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('actions.back', { ns: 'common' })}
            </Button>
            <Button
              variant="danger"
              disabled={note.trim().length === 0 || reject.isPending}
              onClick={doReject}
              className="gap-1.5"
            >
              {reject.isPending && <Loader2 className="size-4 animate-spin" />}
              {t(isReturn ? 'overtime.review.returnConfirm' : 'overtime.review.rejectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {timelineDialog}
    </div>
  );
}
