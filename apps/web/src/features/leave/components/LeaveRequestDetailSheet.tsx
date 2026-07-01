import { useTranslation } from 'react-i18next';
import type { LeaveRequestDto } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, Ban, RotateCcw, ExternalLink, Undo2, Eye } from 'lucide-react';
import { LeaveStatusBadge } from './LeaveStatusBadge';
import { LeaveTimeline } from './LeaveTimeline';
import { useLeaveRequest } from '../hooks/useLeave';
import { formatDays, formatLeaveDate } from '../utils';

interface LeaveRequestDetailSheetProps {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  mode: 'mine' | 'review' | 'all' | 'watching';
  onApprove?: (id: string) => void;
  onReject?: (request: LeaveRequestDto) => void;
  onCancel?: (id: string) => void;
  onResubmit?: (request: LeaveRequestDto) => void;
  isActing?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function LeaveRequestDetailSheet({
  requestId,
  onOpenChange,
  mode,
  onApprove,
  onReject,
  onCancel,
  onResubmit,
  isActing,
}: LeaveRequestDetailSheetProps) {
  const { t } = useTranslation('leave');
  const { data: req, isLoading } = useLeaveRequest(requestId);

  const showReviewActions = mode === 'review' && req?.status === 'PENDING';
  const showOwnerCancel =
    mode === 'mine' && (req?.status === 'PENDING' || req?.status === 'APPROVED');
  const showResubmit = mode === 'mine' && req?.status === 'RETURNED';

  return (
    <Sheet open={!!requestId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>{t('detail.subtitle')}</SheetDescription>
        </SheetHeader>

        {isLoading || !req ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-5 w-1/2 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-24 w-full rounded" />
          </div>
        ) : (
          <div className="mt-6 flex-1 overflow-y-auto space-y-5">
            {/* SPEC-046: CC/watcher read-only notice. */}
            {(mode === 'watching' || req.watchOnly) && (
              <div className="rounded-lg border border-info/30 bg-info-light dark:bg-info/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-info">
                  <Eye className="size-3.5" />
                  {t('detail.watcherBanner')}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: req.leaveType?.colorHex || '#4A9EBF' }}
                  aria-hidden
                />
                <span className="text-base font-semibold text-text-primary">
                  {req.leaveType?.name}
                </span>
              </div>
              <LeaveStatusBadge status={req.status} />
            </div>

            {(mode === 'review' || mode === 'all' || mode === 'watching') && req.employee && (
              <Field label={t('requests.columns.employee')}>
                {req.employee.fullName}
                <span className="text-text-muted"> · {req.employee.employeeCode}</span>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('requests.columns.period')}>
                <span className="tabular-nums">
                  {formatLeaveDate(req.startDate)}
                  {req.startDate !== req.endDate && ` → ${formatLeaveDate(req.endDate)}`}
                </span>
                {req.halfDay && (
                  <span className="ml-1 text-xs text-text-muted">({t('requests.halfDay')})</span>
                )}
              </Field>
              <Field label={t('requests.columns.days')}>
                <span className="tabular-nums font-medium">{formatDays(req.totalDays)}</span>
              </Field>
            </div>

            {req.reason && <Field label={t('requests.columns.reason')}>{req.reason}</Field>}

            {req.attachmentUrl && (
              <Field label={t('form.attachmentUrl')}>
                <a
                  href={req.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {t('detail.viewAttachment')}
                  <ExternalLink className="size-3" />
                </a>
              </Field>
            )}

            {/* RETURNED reason banner — info-blue, not a rejection. */}
            {req.status === 'RETURNED' && req.reviewNote && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  <Undo2 className="size-3.5" />
                  {t('detail.returnedReason')}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">{req.reviewNote}</p>
              </div>
            )}

            {/* Approval timeline */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('timeline.title')}
              </p>
              <LeaveTimeline approvals={req.approvals ?? []} currentStep={req.currentStep} />
            </div>
          </div>
        )}

        {req && (showReviewActions || showOwnerCancel || showResubmit) && (
          <SheetFooter className="mt-4 pt-4 border-t border-border gap-2">
            {showReviewActions && (
              <>
                <Button
                  variant="outline"
                  className="flex-1 text-danger hover:bg-danger-light hover:text-danger"
                  disabled={isActing}
                  onClick={() => onReject?.(req)}
                >
                  <X className="size-4 mr-1.5" />
                  {t('actions.reject')}
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={isActing}
                  onClick={() => onApprove?.(req.id)}
                >
                  <Check className="size-4 mr-1.5" />
                  {t('actions.approve')}
                </Button>
              </>
            )}
            {showResubmit && (
              <Button className="flex-1" disabled={isActing} onClick={() => onResubmit?.(req)}>
                <RotateCcw className="size-4 mr-1.5" />
                {t('actions.resubmit')}
              </Button>
            )}
            {showOwnerCancel && (
              <Button
                variant="outline"
                className="flex-1 text-text-muted hover:text-danger"
                disabled={isActing}
                onClick={() => onCancel?.(req.id)}
              >
                <Ban className="size-4 mr-1.5" />
                {t('actions.cancel')}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
