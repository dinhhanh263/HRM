import { useTranslation } from 'react-i18next';
import { AlertTriangle, Briefcase } from 'lucide-react';
import type { ApplicationStatus } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';
import { useCandidateApplications } from '../hooks/useApplications';

const STATUS_BADGE: Record<ApplicationStatus, BadgeStatus> = {
  ACTIVE: 'active',
  HIRED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'terminated',
  ON_HOLD: 'pending',
};

interface CandidateApplicationsTabProps {
  candidateId: string;
}

export function CandidateApplicationsTab({ candidateId }: CandidateApplicationsTabProps) {
  const { t, i18n } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { data: applications, isLoading, error } = useCandidateApplications(candidateId);
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-border bg-surface">
        <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
          <AlertTriangle className="size-5 text-danger" />
        </div>
        <p className="text-text-primary font-medium">{tc('states.error')}</p>
        <p className="text-text-muted text-sm mt-1">{t('application.tab.loadError')}</p>
      </div>
    );
  }

  if (!applications || applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border bg-surface">
        <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
          <Briefcase size={24} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <h3 className="font-semibold text-text-primary mb-1">
          {t('application.tab.empty.title')}
        </h3>
        <p className="text-sm text-text-muted max-w-xs">
          {t('application.tab.empty.description')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((app) => (
        <div
          key={app.id}
          className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{app.job.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
              <span>
                {t('application.tab.stageLabel')}:{' '}
                <span className="text-text-primary font-medium">{app.currentStage.name}</span>
              </span>
              <span className="text-text-muted">
                {t('application.tab.appliedOn', {
                  date: new Date(app.appliedAt).toLocaleDateString(dateLocale),
                })}
              </span>
            </div>
          </div>
          <StatusBadge
            status={STATUS_BADGE[app.status]}
            label={t(`application.status.${app.status}`)}
          />
        </div>
      ))}
    </div>
  );
}
