import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserSearch,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getInitials } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useCandidate, useUpdateCandidate } from '../hooks/useCandidates';
import { CandidateFormSheet } from '../components/CandidateFormSheet';
import { AddToJobSheet } from '../components/AddToJobSheet';
import { CandidateApplicationsTab } from '../components/CandidateApplicationsTab';
import { CvUploader } from '../components/CvUploader';
import { toast } from '@/components/ui/toast';
import type { CreateCandidateRequest } from '@hrm/shared';

export function CandidateDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canUpdate = can('recruitment:candidate_update');
  const canCreateApplication = can('recruitment:application_create');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [addToJobOpen, setAddToJobOpen] = useState(false);
  const { data: candidate, isLoading, error } = useCandidate(id);
  const updateMutation = useUpdateCandidate(id);
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(dateLocale) : '—';

  async function handleSubmit(payload: CreateCandidateRequest) {
    // Detail edits never re-trigger duplicate checks, but the sheet's contract
    // expects a rejecting promise on failure, so let errors propagate.
    const { force: _force, ...rest } = payload;
    await updateMutation.mutateAsync(rest);
    toast.success(t('candidate.toast.updated'));
    setSheetOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      <Link
        to="/recruitment/candidates"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        {t('candidate.detail.backToList')}
      </Link>

      {isLoading ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border bg-surface">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{tc('states.error')}</p>
          <p className="text-text-muted text-sm mt-1">{t('candidate.detail.loadError')}</p>
        </div>
      ) : !candidate ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <UserSearch size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('candidate.detail.notFound')}</h3>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="size-14">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {getInitials(candidate.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0">
                  {candidate.fullName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-text-secondary">
                  {candidate.currentTitle && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase size={13} className="text-text-muted" />
                      {candidate.currentTitle}
                    </span>
                  )}
                  {candidate.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={13} className="text-text-muted" />
                      {candidate.email}
                    </span>
                  )}
                  {candidate.phone && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Phone size={13} className="text-text-muted" />
                      {candidate.phone}
                    </span>
                  )}
                  {candidate.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} className="text-text-muted" />
                      {candidate.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canUpdate && (
                <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                  {t('candidate.detail.edit')}
                </Button>
              )}
              {canCreateApplication && (
                <Button size="sm" onClick={() => setAddToJobOpen(true)}>
                  <Briefcase size={14} className="mr-1.5" />
                  {t('application.addToJob.trigger')}
                </Button>
              )}
            </div>
          </div>

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">{t('candidate.detail.tabs.profile')}</TabsTrigger>
              <TabsTrigger value="applications">
                {t('candidate.detail.tabs.applications')}
              </TabsTrigger>
              <TabsTrigger value="documents">
                {t('candidate.detail.tabs.documents')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4 space-y-4">
              <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('candidate.detail.profileTitle')}
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-text-muted text-xs">{t('candidate.form.sourceLabel')}</dt>
                    <dd className="text-text-primary mt-0.5">
                      {t(`candidate.source.${candidate.source}`)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted text-xs">{t('candidate.form.expLabel')}</dt>
                    <dd className="text-text-primary mt-0.5 tabular-nums">
                      {candidate.totalYearsExp != null
                        ? t('candidate.table.years', { count: candidate.totalYearsExp })
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted text-xs">{t('candidate.form.dobLabel')}</dt>
                    <dd className="text-text-primary mt-0.5">{fmtDate(candidate.dateOfBirth)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted text-xs">{t('candidate.form.genderLabel')}</dt>
                    <dd className="text-text-primary mt-0.5">
                      {candidate.gender ? t(`candidate.gender.${candidate.gender}`) : '—'}
                    </dd>
                  </div>
                </dl>

                {candidate.skills.length > 0 && (
                  <div>
                    <p className="text-text-muted text-xs mb-1.5">
                      {t('candidate.form.skillsLabel')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills.map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {candidate.links &&
                  (candidate.links.linkedin ||
                    candidate.links.github ||
                    candidate.links.portfolio) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {candidate.links.linkedin && (
                        <a
                          href={candidate.links.linkedin}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          LinkedIn
                        </a>
                      )}
                      {candidate.links.github && (
                        <a
                          href={candidate.links.github}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          GitHub
                        </a>
                      )}
                      {candidate.links.portfolio && (
                        <a
                          href={candidate.links.portfolio}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Portfolio
                        </a>
                      )}
                    </div>
                  )}
              </div>

              {/* PDPL — lawful basis & retention, visible to recruiters. */}
              <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                <h3 className="text-sm font-semibold text-text-primary inline-flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-text-muted" />
                  {t('candidate.detail.consentTitle')}
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-text-muted text-xs">
                      {t('candidate.form.consentGivenAtLabel')}
                    </dt>
                    <dd className="text-text-primary mt-0.5">{fmtDate(candidate.consentGivenAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted text-xs">
                      {t('candidate.form.retentionUntilLabel')}
                    </dt>
                    <dd className="text-text-primary mt-0.5">{fmtDate(candidate.retentionUntil)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-text-muted text-xs">
                      {t('candidate.form.consentSourceLabel')}
                    </dt>
                    <dd className="text-text-primary mt-0.5">{candidate.consentSource ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            </TabsContent>

            <TabsContent value="applications" className="mt-4">
              <CandidateApplicationsTab candidateId={candidate.id} />
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <CvUploader candidateId={candidate.id} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {candidate && (
        <>
          <CandidateFormSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            candidate={candidate}
            onSubmit={handleSubmit}
            isLoading={updateMutation.isPending}
          />
          <AddToJobSheet
            open={addToJobOpen}
            onOpenChange={setAddToJobOpen}
            candidateId={candidate.id}
            defaultSource={candidate.source}
          />
        </>
      )}
    </div>
  );
}
