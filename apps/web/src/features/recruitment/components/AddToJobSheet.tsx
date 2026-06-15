import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Briefcase } from 'lucide-react';
import type { ApiError, CandidateSource } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { useJobs } from '../hooks/useJobs';
import { useCreateApplication } from '../hooks/useApplications';

const CANDIDATE_SOURCES: CandidateSource[] = [
  'CAREER_SITE',
  'JOB_BOARD',
  'REFERRAL',
  'SOURCED',
  'AGENCY',
  'EVENT',
  'DIRECT',
];

interface AddToJobSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  defaultSource: CandidateSource;
}

export function AddToJobSheet({
  open,
  onOpenChange,
  candidateId,
  defaultSource,
}: AddToJobSheetProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');

  const { data: jobs, isLoading: jobsLoading } = useJobs({ status: 'OPEN' });
  const createMutation = useCreateApplication();

  const [jobId, setJobId] = useState('');
  const [source, setSource] = useState<CandidateSource>(defaultSource);

  // Reset selections each time the sheet opens so it never carries stale state.
  useEffect(() => {
    if (open) {
      setJobId('');
      setSource(defaultSource);
    }
  }, [open, defaultSource]);

  async function handleSubmit() {
    if (!jobId) return;
    try {
      await createMutation.mutateAsync({ candidateId, jobId, source });
      toast.success(t('application.addToJob.toastSuccess'));
      onOpenChange(false);
    } catch (err) {
      let msg = t('application.addToJob.errors.GENERIC');
      if (axios.isAxiosError<ApiError>(err)) {
        const code = err.response?.data?.error?.code;
        if (code === 'APPLICATION_DUPLICATE_ACTIVE') {
          msg = t('application.addToJob.errors.DUPLICATE');
        } else if (code === 'JOB_NOT_ACCEPTING') {
          msg = t('application.addToJob.errors.JOB_CLOSED');
        }
      }
      toast.error(msg);
    }
  }

  const openJobs = jobs ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[420px] sm:w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{t('application.addToJob.title')}</SheetTitle>
          <SheetDescription>{t('application.addToJob.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          {!jobsLoading && openJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
                <Briefcase size={22} className="text-text-muted" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-text-secondary max-w-xs">
                {t('application.addToJob.noOpenJobs')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="job">
                  {t('application.addToJob.jobLabel')} <span className="text-danger">*</span>
                </Label>
                <Select value={jobId} onValueChange={setJobId} disabled={jobsLoading}>
                  <SelectTrigger id="job">
                    <SelectValue placeholder={t('application.addToJob.jobPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {openJobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="source">{t('application.addToJob.sourceLabel')}</Label>
                <Select value={source} onValueChange={(v) => setSource(v as CandidateSource)}>
                  <SelectTrigger id="source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANDIDATE_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`candidate.source.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-muted">{t('application.addToJob.sourceHint')}</p>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!jobId || createMutation.isPending}
          >
            {createMutation.isPending ? tc('states.saving') : t('application.addToJob.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
