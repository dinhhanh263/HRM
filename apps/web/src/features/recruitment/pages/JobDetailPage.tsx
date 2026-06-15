import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Briefcase, MapPin, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { useJob } from '../hooks/useJobs';
import { JobStatusBadge } from '../components/JobStatusBadge';
import { StageEditor } from '../components/StageEditor';
import { HiringTeamPanel } from '../components/HiringTeamPanel';
import { JobPipelineBoard } from '../components/JobPipelineBoard';
import { BulkCvImportWizard } from '../components/BulkCvImportWizard';

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canUpdate = can('recruitment:job_update');
  const canBulkImport = can('recruitment:bulk_import');
  const [bulkOpen, setBulkOpen] = useState(false);
  const canMoveApplication = can('recruitment:application_move');
  const canForceMove = can('recruitment:application_force_move');
  const canReject = can('recruitment:application_reject');
  const canHire = can('recruitment:application_hire');
  const canWithdraw = can('recruitment:application_withdraw');
  const canNote = can('recruitment:application_note');
  const canSchedule = can('recruitment:interview_schedule');

  const { data: job, isLoading, error } = useJob(id);
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      <Link
        to="/recruitment"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        {t('job.detail.backToList')}
      </Link>

      {isLoading ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-1/3 rounded" />
            <Skeleton className="h-4 w-1/4 rounded" />
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
          <p className="text-text-muted text-sm mt-1">{t('job.detail.loadError')}</p>
        </div>
      ) : !job ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Briefcase size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('job.detail.notFound')}</h3>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0">
                  {job.title}
                </h1>
                <JobStatusBadge status={job.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-sm text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Briefcase size={13} className="text-text-muted" />
                  {job.department?.name ?? t('job.list.noDepartment')}
                </span>
                <span className="inline-flex items-center gap-1">
                  {t(`job.employmentType.${job.employmentType}`)}
                </span>
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} className="text-text-muted" />
                    {job.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Users size={13} className="text-text-muted" />
                  {t('job.detail.openings', { count: job.headcount })}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {t('job.detail.applications', { count: job.activeApplicationCount })}
                </span>
                <span className="text-text-muted">
                  {t('job.detail.createdAt', {
                    date: new Date(job.createdAt).toLocaleDateString(dateLocale),
                  })}
                </span>
              </div>
            </div>
            {canBulkImport && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => setBulkOpen(true)}>
                  <Upload size={14} className="mr-1.5" />
                  {t('bulkImport.trigger')}
                </Button>
              </div>
            )}
          </div>

          {job.description && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          <Tabs defaultValue="pipeline">
            <TabsList>
              <TabsTrigger value="pipeline">{t('job.detail.tabs.pipeline')}</TabsTrigger>
              <TabsTrigger value="config">{t('job.detail.tabs.config')}</TabsTrigger>
            </TabsList>
            <TabsContent value="pipeline">
              <JobPipelineBoard
                job={job}
                canMove={canMoveApplication}
                canForce={canForceMove}
                canReject={canReject}
                canHire={canHire}
                canWithdraw={canWithdraw}
                canNote={canNote}
                canSchedule={canSchedule}
              />
            </TabsContent>
            <TabsContent value="config" className="space-y-6">
              <StageEditor job={job} canEdit={canUpdate} />
              <HiringTeamPanel job={job} canEdit={canUpdate} />
            </TabsContent>
          </Tabs>

          {canBulkImport && (
            <BulkCvImportWizard open={bulkOpen} onOpenChange={setBulkOpen} jobId={job.id} />
          )}
        </>
      )}
    </div>
  );
}
