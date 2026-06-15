import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  MapPin,
  Video,
  Phone,
  Building2,
  Briefcase,
  CheckCircle2,
  ClipboardEdit,
} from 'lucide-react';
import type { MyInterviewListItemDto, InterviewMode } from '@hrm/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, getInitials } from '@/lib/utils';
import { useMyInterviews } from '../hooks/useInterviews';
import { ScorecardPanel } from '../components/ScorecardPanel';

const MODE_ICON: Record<InterviewMode, typeof Video> = {
  ONSITE: Building2,
  VIDEO: Video,
  PHONE: Phone,
};

function formatWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InterviewCard({
  interview,
  reviewable,
}: {
  interview: MyInterviewListItemDto;
  reviewable?: boolean;
}) {
  const { t, i18n } = useTranslation('recruitment');
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  const ModeIcon = MODE_ICON[interview.mode];
  const [scoring, setScoring] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary tabular-nums">
          <CalendarClock size={15} className="text-primary shrink-0" />
          {formatWhen(interview.scheduledAt, locale)}
          <span className="text-text-muted font-normal">· {interview.durationMin}m</span>
        </div>
        {reviewable && interview.myScorecardSubmitted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            <CheckCircle2 size={12} />
            {t('interview.mine.scored')}
          </span>
        )}
      </div>

      <Link
        to={`/recruitment/candidates/${interview.candidate.id}`}
        className="mt-3 flex items-center gap-3 rounded-md p-2 -mx-2 hover:bg-surface-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={t('interview.mine.viewCandidate')}
      >
        <Avatar style={{ width: 40, height: 40 }}>
          <AvatarImage
            src={interview.candidate.avatar ?? undefined}
            alt={interview.candidate.fullName}
          />
          <AvatarFallback style={{ fontSize: 14 }}>
            {getInitials(interview.candidate.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {interview.candidate.fullName}
          </p>
          <p className="text-xs text-text-muted truncate inline-flex items-center gap-1">
            <Briefcase size={11} />
            {interview.job.title}
          </p>
        </div>
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <ModeIcon size={12} className="text-text-muted" />
          {t(`interview.mode.${interview.mode}`)}
        </span>
        {interview.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} className="text-text-muted" />
            {interview.location}
          </span>
        )}
        {interview.meetingUrl && (
          <a
            href={interview.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            <Video size={12} />
            {t('interview.joinLink')}
          </a>
        )}
      </div>

      {reviewable &&
        (interview.myScorecardSubmitted ? (
          // Already scored: show the evaluation detail inline so the "Đã đánh giá"
          // tab is a readable archive, not a button you have to click to see it.
          // ScorecardPanel carries its own "Sửa" affordance to re-open the form.
          <ScorecardPanel interview={interview} applicationId={interview.applicationId} />
        ) : (
          <>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant={scoring ? 'outline' : 'default'}
                size="sm"
                onClick={() => setScoring((v) => !v)}
              >
                {!scoring && <ClipboardEdit size={14} className="mr-1.5" />}
                {scoring
                  ? t('interview.mine.closeScorecard')
                  : t('interview.mine.enterScorecard')}
              </Button>
            </div>
            {scoring && (
              <ScorecardPanel interview={interview} applicationId={interview.applicationId} />
            )}
          </>
        ))}
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
      {count}
    </span>
  );
}

function TabPanel({
  items,
  reviewable,
  emptyLabel,
}: {
  items: MyInterviewListItemDto[];
  reviewable?: boolean;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((iv) => (
        <InterviewCard key={iv.id} interview={iv} reviewable={reviewable} />
      ))}
    </div>
  );
}

export function MyInterviewsPage() {
  const { t } = useTranslation('recruitment');
  const { data, isLoading, error } = useMyInterviews();

  const isEmpty = data && data.upcoming.length === 0 && data.toReview.length === 0;

  // toReview carries both un-scored and already-scored interviews; split them so
  // "Đang chờ đánh giá" stays a focused to-do list and "Đã đánh giá" an archive.
  const pending = data?.toReview.filter((i) => !i.myScorecardSubmitted) ?? [];
  const reviewed = data?.toReview.filter((i) => i.myScorecardSubmitted) ?? [];
  const upcoming = data?.upcoming ?? [];

  // Open on the tab that needs action first; fall back to whatever has content.
  const defaultTab = pending.length > 0 ? 'pending' : upcoming.length > 0 ? 'upcoming' : 'reviewed';

  return (
    <div className="flex flex-col gap-6 max-w-screen-md">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0">
          {t('interview.mine.title')}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t('interview.mine.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="text-sm text-danger">{t('interview.mine.loadError')}</p>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className={cn(
              'size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4'
            )}
          >
            <CalendarClock size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted max-w-xs">{t('interview.mine.empty')}</p>
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="pending">
              {t('interview.mine.tabs.pending')}
              <CountBadge count={pending.length} />
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {t('interview.mine.tabs.upcoming')}
              <CountBadge count={upcoming.length} />
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              {t('interview.mine.tabs.reviewed')}
              <CountBadge count={reviewed.length} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <TabPanel items={pending} reviewable emptyLabel={t('interview.mine.pendingEmpty')} />
          </TabsContent>
          <TabsContent value="upcoming">
            <TabPanel items={upcoming} emptyLabel={t('interview.mine.upcomingEmpty')} />
          </TabsContent>
          <TabsContent value="reviewed">
            <TabPanel items={reviewed} reviewable emptyLabel={t('interview.mine.reviewedEmpty')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
