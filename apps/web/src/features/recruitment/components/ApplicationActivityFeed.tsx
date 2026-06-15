import { useTranslation } from 'react-i18next';
import {
  Ban,
  CalendarClock,
  ChevronsRight,
  CircleSlash,
  MessageSquare,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { ApplicationActivityDto, ApplicationActivityType } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ApplicationActivityFeedProps {
  activities: ApplicationActivityDto[] | undefined;
  isLoading: boolean;
  error: unknown;
}

const TYPE_ICON: Record<ApplicationActivityType, typeof MessageSquare> = {
  APPLIED: UserPlus,
  STAGE_CHANGED: ChevronsRight,
  NOTE: MessageSquare,
  INTERVIEW_SCHEDULED: CalendarClock,
  REJECTED: Ban,
  HIRED: UserCheck,
  WITHDRAWN: CircleSlash,
};

// Token-based color per activity type; NOTE is neutral, dispositions are semantic.
const TYPE_STYLE: Record<ApplicationActivityType, { dot: string; icon: string }> = {
  APPLIED: { dot: 'bg-surface-alt border-border', icon: 'text-text-muted' },
  STAGE_CHANGED: { dot: 'bg-surface-alt border-border', icon: 'text-text-secondary' },
  NOTE: {
    dot: 'bg-primary/10 border-primary/30',
    icon: 'text-primary',
  },
  INTERVIEW_SCHEDULED: {
    dot: 'bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  REJECTED: {
    dot: 'bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
  },
  HIRED: {
    dot: 'bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
  },
  WITHDRAWN: { dot: 'bg-surface-alt border-border', icon: 'text-text-muted' },
};

function formatTimestamp(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ApplicationActivityFeed({
  activities,
  isLoading,
  error,
}: ApplicationActivityFeedProps) {
  const { t, i18n } = useTranslation('recruitment');
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-danger">{t('activity.loadError')}</p>;
  }

  if (!activities || activities.length === 0) {
    return <p className="text-sm text-text-muted">{t('activity.empty')}</p>;
  }

  return (
    <ol className="space-y-0">
      {activities.map((a, i) => {
        const type = a.type;
        const Icon = TYPE_ICON[type] ?? MessageSquare;
        const style = TYPE_STYLE[type] ?? TYPE_STYLE.NOTE;
        const isLast = i === activities.length - 1;
        const actor = a.author?.fullName ?? t('activity.system');

        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
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
              <p className="text-sm text-text-primary">
                <span className="font-medium">{actor}</span>{' '}
                <span className="text-text-secondary">{t(`activity.event.${type}`)}</span>
              </p>
              <p className="text-xs text-text-muted mt-0.5 tabular-nums">
                {formatTimestamp(a.createdAt, locale)}
              </p>
              {a.body && (
                <p className="text-sm text-text-secondary mt-1.5 rounded-md bg-surface-alt px-2.5 py-2 whitespace-pre-wrap">
                  {a.body}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
