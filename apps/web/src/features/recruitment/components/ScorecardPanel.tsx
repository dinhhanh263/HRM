import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Star } from 'lucide-react';
import type { InterviewDto, ScorecardDto, ScorecardOverall } from '@hrm/shared';
import {
  ScorecardOverall as ScorecardOverallEnum,
  SCORECARD_CRITERIA,
  SCORECARD_OVERALL_SCORE,
} from '@hrm/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { cn, getInitials } from '@/lib/utils';
import { useInterviewScorecards, useSubmitScorecard } from '../hooks/useScorecards';

const OVERALL_OPTIONS = Object.values(ScorecardOverallEnum);

// Worst→best verdict color ramp; keeps a single accent per option, token-aware in dark.
const OVERALL_STYLE: Record<ScorecardOverall, string> = {
  STRONG_NO:
    'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  NO: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  YES: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  STRONG_YES:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
};

function formatWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function OverallChip({ overall }: { overall: ScorecardOverall }) {
  const { t } = useTranslation('recruitment');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        OVERALL_STYLE[overall]
      )}
    >
      {t(`scorecard.overall.${overall}`)}
    </span>
  );
}

function ScorecardCard({ card }: { card: ScorecardDto }) {
  const { t, i18n } = useTranslation('recruitment');
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar style={{ width: 24, height: 24 }}>
            <AvatarImage src={card.interviewer.avatar ?? undefined} alt={card.interviewer.fullName} />
            <AvatarFallback style={{ fontSize: 10 }}>
              {getInitials(card.interviewer.fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-text-primary truncate">
            {card.interviewer.fullName}
          </span>
        </div>
        <OverallChip overall={card.overall} />
      </div>

      {card.ratings && Object.keys(card.ratings).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {SCORECARD_CRITERIA.filter((c) => card.ratings?.[c] != null).map((c) => (
            <span key={c} className="inline-flex items-center gap-1 text-xs text-text-secondary">
              {t(`scorecard.criteria.${c}`)}
              <span className="inline-flex items-center gap-0.5 font-medium text-text-primary tabular-nums">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                {card.ratings?.[c]}
              </span>
            </span>
          ))}
        </div>
      )}

      {card.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{card.notes}</p>
      )}

      {card.submittedAt && (
        <p className="mt-2 text-xs text-text-muted tabular-nums">
          {t('scorecard.submittedAt', { when: formatWhen(card.submittedAt, locale) })}
        </p>
      )}
    </div>
  );
}

function ScorecardForm({
  interviewId,
  applicationId,
  existing,
  onDone,
}: {
  interviewId: string;
  applicationId: string;
  existing: ScorecardDto | null;
  onDone: () => void;
}) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const submit = useSubmitScorecard(interviewId, applicationId);

  const [overall, setOverall] = useState<ScorecardOverall | null>(existing?.overall ?? null);
  const [ratings, setRatings] = useState<Record<string, number>>(existing?.ratings ?? {});
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const canSubmit = !!overall && !submit.isPending;

  function save() {
    if (!overall) return;
    submit.mutate(
      {
        overall,
        ratings: Object.keys(ratings).length > 0 ? ratings : undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('scorecard.toast.submitted'));
          onDone();
        },
        onError: () => toast.error(t('scorecard.toast.error')),
      }
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface-alt/50 p-3">
      <div className="space-y-1.5">
        <Label>
          {t('scorecard.overall.label')} <span className="text-danger">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OVERALL_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setOverall(opt)}
              aria-pressed={overall === opt}
              className={cn(
                'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                overall === opt
                  ? OVERALL_STYLE[opt]
                  : 'border-border bg-background text-text-secondary hover:bg-surface-alt'
              )}
            >
              {t(`scorecard.overall.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label>{t('scorecard.criteria.label')}</Label>
          <span className="text-xs text-text-muted">{t('scorecard.ratingScale')}</span>
        </div>
        <div className="space-y-1.5">
          {SCORECARD_CRITERIA.map((c) => (
            <div key={c} className="flex items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">{t(`scorecard.criteria.${c}`)}</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      setRatings((prev) => {
                        const next = { ...prev };
                        if (next[c] === n) delete next[c];
                        else next[c] = n;
                        return next;
                      })
                    }
                    aria-label={`${t(`scorecard.criteria.${c}`)}: ${n}`}
                    aria-pressed={ratings[c] === n}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      ratings[c] === n
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-text-secondary hover:bg-surface-alt'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sc-notes">{t('scorecard.notes.label')}</Label>
        <Textarea
          id="sc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('scorecard.notes.placeholder')}
          maxLength={5000}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {tc('actions.cancel')}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSubmit}>
          {submit.isPending
            ? tc('states.saving')
            : existing
              ? t('scorecard.resubmit')
              : t('scorecard.submit')}
        </Button>
      </div>
    </div>
  );
}

export function ScorecardPanel({
  interview,
  applicationId,
}: {
  interview: InterviewDto;
  applicationId: string;
}) {
  const { t } = useTranslation('recruitment');
  const { data, isLoading, error } = useInterviewScorecards(interview.id);
  const [editing, setEditing] = useState(false);

  // Close the inline form once the submission is reflected in the query.
  const mine = data?.mine ?? null;
  useEffect(() => {
    if (mine) setEditing(false);
  }, [mine]);

  const average = useMemo(() => {
    if (!data) return null;
    const cards = [...(data.mine ? [data.mine] : []), ...data.others];
    if (cards.length === 0) return null;
    const sum = cards.reduce((acc, c) => acc + SCORECARD_OVERALL_SCORE[c.overall], 0);
    return sum / cards.length;
  }, [data]);

  if (isLoading) {
    return <Skeleton className="mt-3 h-24 w-full rounded-md" />;
  }
  if (error || !data) {
    return <p className="mt-3 text-sm text-danger">{t('scorecard.loadError')}</p>;
  }

  const showForm = data.isInterviewer && (editing || !mine);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {t('scorecard.title')}
        </h4>
        <div className="flex items-center gap-2">
          {average != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-primary">
              {t('scorecard.averageLabel')}
              <span className="tabular-nums">{average.toFixed(1)}</span>
            </span>
          )}
          <span className="text-xs text-text-muted tabular-nums">
            {t('scorecard.progress', {
              submitted: data.submittedCount,
              total: data.totalInterviewers,
            })}
          </span>
        </div>
      </div>

      {showForm ? (
        <ScorecardForm
          interviewId={interview.id}
          applicationId={applicationId}
          existing={mine}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-2">
          {mine && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {t('scorecard.mineTitle')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditing(true)}
                >
                  {t('scorecard.edit')}
                </Button>
              </div>
              <ScorecardCard card={mine} />
            </div>
          )}

          {data.canViewOthers ? (
            data.others.length > 0 ? (
              <div>
                {mine && (
                  <p className="mb-1 mt-2 text-xs font-medium text-text-secondary">
                    {t('scorecard.othersTitle')}
                  </p>
                )}
                <div className="space-y-2">
                  {data.others.map((c) => (
                    <ScorecardCard key={c.id} card={c} />
                  ))}
                </div>
              </div>
            ) : (
              !mine && (
                <p className="text-sm text-text-muted">{t('scorecard.emptyForViewer')}</p>
              )
            )
          ) : (
            data.submittedCount > 0 && (
              <p className="inline-flex items-start gap-1.5 text-xs text-text-muted">
                <Lock size={12} className="mt-0.5 shrink-0" />
                {t('scorecard.noPeek')}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
