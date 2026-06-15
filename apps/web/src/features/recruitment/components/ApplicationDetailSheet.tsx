import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { ApplicationDto } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useApplicationActivities } from '../hooks/useApplications';
import { ApplicationActivityFeed } from './ApplicationActivityFeed';
import { InterviewScheduler } from './InterviewScheduler';
import { NoteComposer } from './NoteComposer';

interface ApplicationDetailSheetProps {
  application: ApplicationDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canNote: boolean;
  canSchedule: boolean;
}

export function ApplicationDetailSheet({
  application,
  open,
  onOpenChange,
  canNote,
  canSchedule,
}: ApplicationDetailSheetProps) {
  const { t } = useTranslation('recruitment');
  const {
    data: activities,
    isLoading,
    error,
  } = useApplicationActivities(open ? (application?.id ?? null) : null);

  // The composer is uncontrolled per application; remount it when the sheet
  // switches to another candidate so its draft never leaks across applications.
  const [composerKey, setComposerKey] = useState(application?.id ?? '');
  useEffect(() => {
    if (application?.id) setComposerKey(application.id);
  }, [application?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[540px] flex flex-col">
        {application && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar style={{ width: 40, height: 40 }}>
                  <AvatarImage
                    src={application.candidate.avatar ?? undefined}
                    alt={application.candidate.fullName}
                  />
                  <AvatarFallback style={{ fontSize: 14 }}>
                    {getInitials(application.candidate.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{application.candidate.fullName}</SheetTitle>
                  <SheetDescription className="truncate">
                    {application.candidate.currentTitle ?? application.job.title}
                  </SheetDescription>
                </div>
              </div>
              <Link
                to={`/recruitment/applications/${application.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              >
                <ExternalLink size={14} />
                {t('application.detail.openFullPage')}
              </Link>
            </SheetHeader>

            <div className="mt-6 flex-1 overflow-y-auto pr-1 space-y-6">
              <InterviewScheduler applicationId={application.id} canSchedule={canSchedule} />

              <div>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                  {t('activity.title')}
                </h3>
                <ApplicationActivityFeed
                  activities={activities}
                  isLoading={isLoading}
                  error={error}
                />
              </div>
            </div>

            {canNote && (
              <div className="mt-4 border-t border-border pt-4">
                <NoteComposer key={composerKey} applicationId={application.id} />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
