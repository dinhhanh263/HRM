import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type {
  ApiError,
  CandidateDto,
  CandidateSource,
  CandidateDuplicateMatch,
  CreateCandidateRequest,
  Gender,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

const CANDIDATE_SOURCES: CandidateSource[] = [
  'CAREER_SITE',
  'JOB_BOARD',
  'REFERRAL',
  'SOURCED',
  'AGENCY',
  'EVENT',
  'DIRECT',
];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];
export const GENDER_NONE = 'none';

interface CandidateFormValues {
  fullName: string;
  email: string;
  phone: string;
  currentTitle: string;
  totalYearsExp: string;
  source: CandidateSource;
  location: string;
  dateOfBirth: string;
  gender: string;
  skills: string;
  linkedin: string;
  github: string;
  portfolio: string;
  consentGivenAt: string;
  consentSource: string;
  retentionUntil: string;
}

// Translate a free-form skills textarea ("Node.js, React") into a clean array.
function parseSkills(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toPayload(values: CandidateFormValues, force: boolean): CreateCandidateRequest {
  const links: CreateCandidateRequest['links'] = {};
  if (values.linkedin.trim()) links.linkedin = values.linkedin.trim();
  if (values.github.trim()) links.github = values.github.trim();
  if (values.portfolio.trim()) links.portfolio = values.portfolio.trim();

  return {
    fullName: values.fullName.trim(),
    email: values.email.trim() || undefined,
    phone: values.phone.trim() || undefined,
    currentTitle: values.currentTitle.trim() || undefined,
    totalYearsExp: values.totalYearsExp.trim() ? Number(values.totalYearsExp) : undefined,
    source: values.source,
    location: values.location.trim() || undefined,
    dateOfBirth: values.dateOfBirth || undefined,
    gender: values.gender === GENDER_NONE ? undefined : (values.gender as Gender),
    skills: parseSkills(values.skills),
    links: Object.keys(links).length > 0 ? links : undefined,
    consentGivenAt: values.consentGivenAt ? new Date(values.consentGivenAt).toISOString() : undefined,
    consentSource: values.consentSource.trim() || undefined,
    retentionUntil: values.retentionUntil || undefined,
    force,
  };
}

interface CandidateFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate?: CandidateDto | null;
  // Submits the payload. Must reject on failure so the sheet can surface
  // the possible-duplicate warning. Resolves on success.
  onSubmit: (payload: CreateCandidateRequest) => Promise<void>;
  isLoading?: boolean;
}

export function CandidateFormSheet({
  open,
  onOpenChange,
  candidate,
  onSubmit,
  isLoading,
}: CandidateFormSheetProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const isEditing = !!candidate;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duplicates, setDuplicates] = useState<CandidateDuplicateMatch[] | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        fullName: z
          .string()
          .min(1, t('candidate.validation.nameRequired'))
          .max(150, t('candidate.validation.nameMax')),
        email: z.string().email(t('candidate.validation.emailInvalid')).or(z.literal('')),
        phone: z.string().max(30),
        currentTitle: z.string().max(150),
        totalYearsExp: z.string(),
        source: z.enum([
          'CAREER_SITE',
          'JOB_BOARD',
          'REFERRAL',
          'SOURCED',
          'AGENCY',
          'EVENT',
          'DIRECT',
        ]),
        location: z.string().max(150),
        dateOfBirth: z.string(),
        gender: z.string(),
        skills: z.string(),
        linkedin: z.string().url(t('candidate.validation.urlInvalid')).or(z.literal('')),
        github: z.string().url(t('candidate.validation.urlInvalid')).or(z.literal('')),
        portfolio: z.string().url(t('candidate.validation.urlInvalid')).or(z.literal('')),
        consentGivenAt: z.string(),
        consentSource: z.string().max(200),
        retentionUntil: z.string(),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { errors },
  } = useForm<CandidateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      currentTitle: '',
      totalYearsExp: '',
      source: 'DIRECT',
      location: '',
      dateOfBirth: '',
      gender: GENDER_NONE,
      skills: '',
      linkedin: '',
      github: '',
      portfolio: '',
      consentGivenAt: '',
      consentSource: '',
      retentionUntil: '',
    },
  });

  useEffect(() => {
    if (open) {
      setDuplicates(null);
      setShowAdvanced(false);
      reset({
        fullName: candidate?.fullName ?? '',
        email: candidate?.email ?? '',
        phone: candidate?.phone ?? '',
        currentTitle: candidate?.currentTitle ?? '',
        totalYearsExp:
          candidate?.totalYearsExp != null ? String(candidate.totalYearsExp) : '',
        source: candidate?.source ?? 'DIRECT',
        location: candidate?.location ?? '',
        dateOfBirth: candidate?.dateOfBirth ? candidate.dateOfBirth.slice(0, 10) : '',
        gender: candidate?.gender ?? GENDER_NONE,
        skills: candidate?.skills?.join(', ') ?? '',
        linkedin: candidate?.links?.linkedin ?? '',
        github: candidate?.links?.github ?? '',
        portfolio: candidate?.links?.portfolio ?? '',
        consentGivenAt: candidate?.consentGivenAt ? candidate.consentGivenAt.slice(0, 10) : '',
        consentSource: candidate?.consentSource ?? '',
        retentionUntil: candidate?.retentionUntil ? candidate.retentionUntil.slice(0, 10) : '',
      });
    }
  }, [open, candidate, reset]);

  async function submit(values: CandidateFormValues, force: boolean) {
    try {
      await onSubmit(toPayload(values, force));
    } catch (err) {
      // The service flags a soft same-name match with 409 + matches in details.
      // Surface them so the recruiter can review before forcing creation.
      if (axios.isAxiosError<ApiError>(err)) {
        const apiError = err.response?.data?.error;
        if (apiError?.code === 'CANDIDATE_POSSIBLE_DUPLICATE') {
          const details = apiError.details as { matches?: CandidateDuplicateMatch[] } | undefined;
          setDuplicates(details?.matches ?? []);
        }
      }
    }
  }

  const onValid = (values: CandidateFormValues) => submit(values, false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[540px] sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? t('candidate.form.editTitle') : t('candidate.form.createTitle')}
          </SheetTitle>
          <SheetDescription>
            {isEditing ? t('candidate.form.editDescription') : t('candidate.form.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <form
          id="candidate-form"
          onSubmit={handleSubmit(onValid)}
          className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fullName">
              {t('candidate.form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder={t('candidate.form.namePlaceholder')}
              error={!!errors.fullName}
              {...register('fullName')}
            />
            {errors.fullName && <p className="text-xs text-danger">{errors.fullName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('candidate.form.emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                error={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('candidate.form.phoneLabel')}</Label>
              <Input id="phone" placeholder="0901234567" {...register('phone')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="currentTitle">{t('candidate.form.currentTitleLabel')}</Label>
              <Input
                id="currentTitle"
                placeholder={t('candidate.form.currentTitlePlaceholder')}
                {...register('currentTitle')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totalYearsExp">{t('candidate.form.expLabel')}</Label>
              <Input
                id="totalYearsExp"
                type="number"
                min={0}
                step={0.5}
                placeholder="0"
                {...register('totalYearsExp')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source">{t('candidate.form.sourceLabel')}</Label>
            <Controller
              name="source"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
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
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skills">{t('candidate.form.skillsLabel')}</Label>
            <Input
              id="skills"
              placeholder={t('candidate.form.skillsPlaceholder')}
              {...register('skills')}
            />
            <p className="text-xs text-text-muted">{t('candidate.form.skillsHint')}</p>
          </div>

          {/* Progressive disclosure — optional profile fields stay hidden until needed. */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform', showAdvanced && 'rotate-90')}
            />
            {t('candidate.form.advancedToggle')}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
              <div className="space-y-1.5">
                <Label htmlFor="location">{t('candidate.form.locationLabel')}</Label>
                <Input
                  id="location"
                  placeholder={t('candidate.form.locationPlaceholder')}
                  {...register('location')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dateOfBirth">{t('candidate.form.dobLabel')}</Label>
                  <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gender">{t('candidate.form.genderLabel')}</Label>
                  <Controller
                    name="gender"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="gender">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GENDER_NONE}>
                            {t('candidate.form.genderNone')}
                          </SelectItem>
                          {GENDERS.map((g) => (
                            <SelectItem key={g} value={g}>
                              {t(`candidate.gender.${g}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="linkedin">{t('candidate.form.linkedinLabel')}</Label>
                <Input
                  id="linkedin"
                  placeholder="https://linkedin.com/in/..."
                  error={!!errors.linkedin}
                  {...register('linkedin')}
                />
                {errors.linkedin && (
                  <p className="text-xs text-danger">{errors.linkedin.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="github">{t('candidate.form.githubLabel')}</Label>
                  <Input
                    id="github"
                    placeholder="https://github.com/..."
                    error={!!errors.github}
                    {...register('github')}
                  />
                  {errors.github && (
                    <p className="text-xs text-danger">{errors.github.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="portfolio">{t('candidate.form.portfolioLabel')}</Label>
                  <Input
                    id="portfolio"
                    placeholder="https://..."
                    error={!!errors.portfolio}
                    {...register('portfolio')}
                  />
                  {errors.portfolio && (
                    <p className="text-xs text-danger">{errors.portfolio.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PDPL — lawful basis for storing the candidate's personal data. */}
          <div className="rounded-lg border border-border bg-surface-alt/50 p-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                {t('candidate.form.consentTitle')}
              </h4>
              <p className="text-xs text-text-muted mt-0.5">{t('candidate.form.consentHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="consentGivenAt">{t('candidate.form.consentGivenAtLabel')}</Label>
                <Input id="consentGivenAt" type="date" {...register('consentGivenAt')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="retentionUntil">{t('candidate.form.retentionUntilLabel')}</Label>
                <Input id="retentionUntil" type="date" {...register('retentionUntil')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consentSource">{t('candidate.form.consentSourceLabel')}</Label>
              <Input
                id="consentSource"
                placeholder={t('candidate.form.consentSourcePlaceholder')}
                {...register('consentSource')}
              />
            </div>
          </div>

          {/* Soft same-name duplicate warning — recruiter reviews then forces. */}
          {duplicates && (
            <div className="rounded-lg border border-warning/40 bg-warning-light/50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">
                    {t('candidate.duplicate.title')}
                  </h4>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {t('candidate.duplicate.description')}
                  </p>
                </div>
              </div>
              {duplicates.length > 0 && (
                <ul className="space-y-1.5">
                  {duplicates.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-md bg-surface px-3 py-2 text-xs text-text-secondary"
                    >
                      <span className="font-medium text-text-primary">{m.fullName}</span>
                      {m.currentTitle && <span> · {m.currentTitle}</span>}
                      {m.email && <span> · {m.email}</span>}
                      {m.phone && <span> · {m.phone}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() => submit(getValues(), true)}
              >
                {t('candidate.duplicate.forceCreate')}
              </Button>
            </div>
          )}
        </form>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="candidate-form" disabled={isLoading}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('candidate.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
