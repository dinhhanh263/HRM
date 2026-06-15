import { useTranslation } from 'react-i18next';
import type { LeaveApprovalDto, ApprovalDecision } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { Check, Clock, Undo2, SkipForward } from 'lucide-react';
import { formatLeaveDate } from '../utils';

interface LeaveTimelineProps {
  approvals: LeaveApprovalDto[];
  /** 1-based step the request is currently waiting on (for the active round). */
  currentStep: number;
}

type StepState = 'approved' | 'returned' | 'auto-skipped' | 'pending' | 'upcoming';

function decisionToState(
  decision: ApprovalDecision | null,
  isCurrent: boolean
): StepState {
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'RETURNED') return 'returned';
  if (decision === 'AUTO_SKIPPED') return 'auto-skipped';
  return isCurrent ? 'pending' : 'upcoming';
}

const STATE_ICON: Record<StepState, typeof Check> = {
  approved: Check,
  returned: Undo2,
  'auto-skipped': SkipForward,
  pending: Clock,
  upcoming: Clock,
};

// Token-based color per state — info-blue for returned (not a rejection).
const STATE_STYLE: Record<StepState, { dot: string; icon: string }> = {
  approved: { dot: 'bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-800', icon: 'text-green-600 dark:text-green-400' },
  returned: { dot: 'bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-800', icon: 'text-blue-600 dark:text-blue-400' },
  'auto-skipped': { dot: 'bg-surface-alt border-border', icon: 'text-text-muted' },
  pending: { dot: 'bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-800', icon: 'text-amber-600 dark:text-amber-400' },
  upcoming: { dot: 'bg-surface-alt border-border', icon: 'text-text-muted' },
};

export function LeaveTimeline({ approvals, currentStep }: LeaveTimelineProps) {
  const { t } = useTranslation('leave');

  if (!approvals || approvals.length === 0) {
    return <p className="text-sm text-text-muted">{t('timeline.empty')}</p>;
  }

  // Group by round; render newest round first. The active round is max(round).
  const rounds = [...new Set(approvals.map((a) => a.round))].sort((a, b) => b - a);
  const activeRound = rounds[0];
  const multiRound = rounds.length > 1;

  function approverLabel(a: LeaveApprovalDto): string {
    if (a.approverType === 'ROLE' && a.roleKey) {
      return `${t('approverType.ROLE')} · ${a.roleKey}`;
    }
    return t(`approverType.${a.approverType}`);
  }

  // Auto-skipped steps carry a machine-readable system code (NO_APPROVER,
  // SELF_APPROVAL, DUPLICATE_APPROVER); translate it. Human approver notes
  // (e.g. a RETURNED reason) are free text and shown verbatim.
  function noteText(a: LeaveApprovalDto): string | null {
    if (!a.note) return null;
    if (a.decision === 'AUTO_SKIPPED') {
      return t(`timeline.skipReason.${a.note}`, { defaultValue: a.note });
    }
    return a.note;
  }

  return (
    <div className="space-y-5">
      {rounds.map((round) => {
        const steps = approvals
          .filter((a) => a.round === round)
          .sort((x, y) => x.stepOrder - y.stepOrder);
        const isActiveRound = round === activeRound;

        return (
          <div key={round} className="space-y-3">
            {multiRound && (
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('timeline.round', { n: round })}
                {isActiveRound && (
                  <span className="ml-1.5 text-primary normal-case font-medium">
                    ({t('timeline.current')})
                  </span>
                )}
              </p>
            )}
            <ol className="space-y-0">
              {steps.map((a, i) => {
                const isCurrent = isActiveRound && a.stepOrder === currentStep && a.decision === null;
                const state = decisionToState(a.decision, isCurrent);
                const Icon = STATE_ICON[state];
                const style = STATE_STYLE[state];
                const isLast = i === steps.length - 1;
                return (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* connector line */}
                    {!isLast && (
                      <span
                        className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border',
                        style.dot
                      )}
                    >
                      <Icon className={cn('size-3.5', style.icon)} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text-primary">
                          <span className="text-text-muted mr-1.5 tabular-nums">
                            {t('timeline.step', { n: a.stepOrder })}
                          </span>
                          {approverLabel(a)}
                        </p>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            state === 'approved' && 'text-green-600 dark:text-green-400',
                            state === 'returned' && 'text-blue-600 dark:text-blue-400',
                            state === 'pending' && 'text-amber-600 dark:text-amber-400',
                            (state === 'upcoming' || state === 'auto-skipped') && 'text-text-muted'
                          )}
                        >
                          {t(`timeline.state.${state}`)}
                        </span>
                      </div>
                      {a.decidedAt && (
                        <p className="text-xs text-text-muted mt-0.5">
                          {a.decidedBy?.fullName
                            ? t('timeline.decidedBy', {
                                name: a.decidedBy.fullName,
                                date: formatLeaveDate(a.decidedAt),
                              })
                            : formatLeaveDate(a.decidedAt)}
                        </p>
                      )}
                      {noteText(a) && (
                        <p className="text-xs text-text-secondary mt-1 rounded-md bg-surface-alt px-2.5 py-1.5">
                          {noteText(a)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
