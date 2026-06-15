import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Briefcase, ClipboardList, FileText } from 'lucide-react';
import type {
  ApplicationStatus,
  ScorecardOverall,
  ScorecardSummaryItemDto,
} from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePermission } from '@/hooks/usePermission';
import { cn, getInitials } from '@/lib/utils';
import { useApplication, useApplicationActivities } from '../hooks/useApplications';
import { useApplicationScorecardSummary } from '../hooks/useScorecards';
import { ApplicationActivityFeed } from '../components/ApplicationActivityFeed';
import { InterviewScheduler } from '../components/InterviewScheduler';
import { NoteComposer } from '../components/NoteComposer';

const STATUS_BADGE: Record<ApplicationStatus, BadgeStatus> = {
  ACTIVE: 'active',
  HIRED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'terminated',
  ON_HOLD: 'pending',
};

// The average verdict color mirrors a hire signal: red (lean no) → green (lean yes).
function scoreTone(avg: number | null): string {
  if (avg === null) return 'text-text-muted';
  if (avg >= 3) return 'text-green-600 dark:text-green-400';
  if (avg >= 2) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

const OVERALL_TONE: Record<ScorecardOverall, string> = {
  STRONG_YES: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  YES: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  NO: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  STRONG_NO: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function ScorecardSummary({ applicationId }: { applicationId: string }) {
  const { t, i18n } = useTranslation('recruitment');
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  const { data, isLoading, error } = useApplicationScorecardSummary(applicationId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-danger">{t('scorecard.loadError')}</p>;
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-text-muted">{t('application.detail.scorecards.empty')}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {data.map((item: ScorecardSummaryItemDto) => (
        <li key={item.interviewId} className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {t(`interview.mode.${item.mode}`)} ·{' '}
                <span className="text-text-secondary tabular-nums">
                  {new Date(item.scheduledAt).toLocaleDateString(locale)}
                </span>
              </p>
              <p className="text-xs text-text-muted mt-0.5 tabular-nums">
                {t('application.detail.scorecards.progress', {
                  submitted: item.submittedCount,
                  total: item.totalInterviewers,
                })}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className={cn('text-lg font-bold tabular-nums', scoreTone(item.averageScore))}>
                {item.averageScore !== null ? item.averageScore.toFixed(1) : '—'}
              </span>
              <p className="text-[11px] text-text-muted">
                {t('application.detail.scorecards.averageLabel')}
              </p>
            </div>
          </div>
          {item.redacted && (
            <p className="mt-2.5 text-[11px] text-text-muted italic">
              {t('application.detail.scorecards.redacted')}
            </p>
          )}
          {item.recommendations.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.recommendations.map((rec) => (
                <span
                  key={rec.interviewer.employeeId}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    OVERALL_TONE[rec.overall]
                  )}
                >
                  {rec.interviewer.fullName} · {t(`scorecard.overall.${rec.overall}`)}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canNote = can('recruitment:application_note');
  const canSchedule = can('recruitment:interview_schedule');

  const { data: application, isLoading, error } = useApplication(id);
  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = useApplicationActivities(id);
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  const backTo = application ? `/recruitment/jobs/${application.jobId}` : '/recruitment';

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        <ArrowLeft size={14} />
        {t('application.detail.backToBoard')}
      </Link>

      {isLoading ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border bg-surface">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{tc('states.error')}</p>
          <p className="text-text-muted text-sm mt-1">{t('application.detail.loadError')}</p>
        </div>
      ) : !application ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <FileText size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">
            {t('application.detail.notFound')}
          </h3>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar style={{ width: 48, height: 48 }}>
              <AvatarImage
                src={application.candidate.avatar ?? undefined}
                alt={application.candidate.fullName}
              />
              <AvatarFallback style={{ fontSize: 16 }}>
                {getInitials(application.candidate.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0 truncate">
                  {application.candidate.fullName}
                </h1>
                <StatusBadge
                  status={STATUS_BADGE[application.status]}
                  label={t(`application.status.${application.status}`)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-sm text-text-secondary">
                {application.candidate.currentTitle && (
                  <span>{application.candidate.currentTitle}</span>
                )}
                <Link
                  to={`/recruitment/jobs/${application.jobId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                >
                  <Briefcase size={13} />
                  {application.job.title}
                </Link>
                <span className="text-text-muted">
                  {t('application.detail.sourceLabel')}:{' '}
                  {t(`candidate.source.${application.source}`)}
                </span>
                <span className="text-text-muted tabular-nums">
                  {t('application.detail.appliedOn', {
                    date: new Date(application.appliedAt).toLocaleDateString(dateLocale),
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              <section className="rounded-lg border border-border bg-surface p-5">
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">
                  {t('application.detail.interviews.title')}
                </h2>
                <InterviewScheduler applicationId={application.id} canSchedule={canSchedule} />
              </section>

              <section className="rounded-lg border border-border bg-surface p-5">
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">
                  {t('application.detail.activity.title')}
                </h2>
                <ApplicationActivityFeed
                  activities={activities}
                  isLoading={activitiesLoading}
                  error={activitiesError}
                />
                {canNote && (
                  <div className="mt-4 border-t border-border pt-4">
                    <NoteComposer applicationId={application.id} />
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <section className="rounded-lg border border-border bg-surface p-5">
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                  {t('application.detail.stage.title')}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                    {application.currentStage.name}
                  </span>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-surface p-5">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                  <ClipboardList size={13} />
                  {t('application.detail.scorecards.title')}
                </h2>
                <ScorecardSummary applicationId={application.id} />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
