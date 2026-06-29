import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, RotateCcw } from 'lucide-react';
import type { KpiScorecardDto, ReviewScorecardInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scorecard: KpiScorecardDto | null;
  onReview: (body: ReviewScorecardInput) => void;
  onResubmit: () => void;
  saving?: boolean;
}

export function ReviewSheet({ open, onOpenChange, scorecard, onReview, onResubmit, saving }: Props) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [f, setF] = useState({ strengths: '', areasToImprove: '', actionPlan: '', recognition: '', reviewComment: '', note: '' });

  useEffect(() => {
    if (scorecard) setF({
      strengths: scorecard.strengths ?? '', areasToImprove: scorecard.areasToImprove ?? '',
      actionPlan: scorecard.actionPlan ?? '', recognition: scorecard.recognition ?? '',
      reviewComment: scorecard.reviewComment ?? '', note: '',
    });
  }, [scorecard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scorecard) return null;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const notes = (): ReviewScorecardInput => ({
    decision: 'APPROVED',
    strengths: f.strengths || null, areasToImprove: f.areasToImprove || null,
    actionPlan: f.actionPlan || null, recognition: f.recognition || null,
    reviewComment: f.reviewComment || null, note: f.note || null,
  });

  const inReview = scorecard.status === 'IN_REVIEW';
  const returned = scorecard.status === 'SELF_ASSESSED' && scorecard.approvals.some((a) => a.decision === 'RETURNED');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('review.title')} — {scorecard.employeeName}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Score summary */}
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">{t('cycle.total')}</p>
              <p className="text-2xl font-bold tabular-nums">{scorecard.weightedTotal ?? '—'}</p>
            </div>
            {scorecard.ratingLabel && <Badge variant="outline">{scorecard.ratingLabel}</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {scorecard.pillars.map((p) => (
              <span key={p.pillarId} className="text-text-secondary">{p.pillarName}: <span className="font-medium text-text-primary tabular-nums">{p.score ?? '—'}</span></span>
            ))}
          </div>

          {/* Self assessment */}
          {scorecard.selfComment && (
            <div className="rounded-md bg-surface-alt p-3">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">{t('review.selfComment')}</p>
              <p className="text-sm whitespace-pre-wrap">{scorecard.selfComment}</p>
            </div>
          )}

          {/* Approval timeline */}
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">{t('review.timeline')}</p>
            <ol className="space-y-1.5">
              {scorecard.approvals.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px]',
                    a.decision === 'APPROVED' ? 'bg-success/15 text-success'
                    : a.decision === 'RETURNED' ? 'bg-warning/15 text-warning'
                    : a.decision === 'AUTO_SKIPPED' ? 'bg-surface-alt text-text-muted'
                    : a.stepOrder === scorecard.currentStep ? 'bg-primary/15 text-primary' : 'bg-surface-alt text-text-muted')}>
                    {a.decision === 'APPROVED' ? <Check size={12} /> : a.decision === 'RETURNED' ? <X size={12} /> : a.stepOrder}
                  </span>
                  <span className="text-text-secondary">
                    {a.approverType === 'ROLE' ? `${t('review.role')}: ${a.roleKey}` : a.approverType}
                    {' · '}{a.decision ? t(`review.decision.${a.decision}`) : t('review.pending')}
                    {a.round > 1 && ` ${t('review.round', { n: a.round })}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Review notes (manager) */}
          {inReview && (
            <div className="space-y-3">
              {(['strengths', 'areasToImprove', 'actionPlan', 'recognition', 'reviewComment'] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label>{t(`review.${k}`)}</Label>
                  <Textarea rows={2} value={f[k]} onChange={(e) => set(k)(e.target.value)} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>{t('review.note')}</Label>
                <Textarea rows={2} value={f.note} onChange={(e) => set('note')(e.target.value)} placeholder={t('review.notePlaceholder')} />
              </div>
            </div>
          )}
        </div>
        <SheetFooter className="mt-4">
          {returned && (
            <Button variant="outline" onClick={onResubmit} disabled={saving}>
              <RotateCcw size={14} className="mr-1.5" />{t('review.resubmit')}
            </Button>
          )}
          {inReview && (
            <>
              <Button variant="outline" className="text-warning border-warning/40 hover:bg-warning/10"
                disabled={saving} onClick={() => onReview({ ...notes(), decision: 'RETURNED' })}>
                <X size={14} className="mr-1.5" />{t('review.return')}
              </Button>
              <Button disabled={saving} onClick={() => onReview(notes())}>
                <Check size={14} className="mr-1.5" />{t('review.approve')}
              </Button>
            </>
          )}
          {!inReview && !returned && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.close')}</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
