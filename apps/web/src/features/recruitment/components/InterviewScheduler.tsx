import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarPlus,
  Search,
  X,
  MapPin,
  Video,
  Phone,
  Building2,
  Clock,
  MoreHorizontal,
} from 'lucide-react';
import type {
  InterviewDto,
  InterviewMode,
  InterviewStatus,
  InterviewTerminalStatus,
  CreateInterviewRequest,
} from '@hrm/shared';
import { InterviewMode as InterviewModeEnum } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { cn, getInitials } from '@/lib/utils';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import {
  useApplicationInterviews,
  useCreateInterview,
  useUpdateInterviewStatus,
} from '../hooks/useInterviews';
import { ScorecardPanel } from './ScorecardPanel';

const MODES = Object.values(InterviewModeEnum);
const TERMINAL_STATUSES: InterviewTerminalStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const MODE_ICON: Record<InterviewMode, typeof Video> = {
  ONSITE: Building2,
  VIDEO: Video,
  PHONE: Phone,
};

// Token-aware status chip; SCHEDULED is informational, the terminal states carry semantics.
const STATUS_STYLE: Record<InterviewStatus, string> = {
  SCHEDULED:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  COMPLETED:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  CANCELLED:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  NO_SHOW:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
};

function formatWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const { t } = useTranslation('recruitment');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_STYLE[status]
      )}
    >
      {t(`interview.status.${status}`)}
    </span>
  );
}

function InterviewRow({ interview }: { interview: InterviewDto }) {
  const { t, i18n } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  const updateStatus = useUpdateInterviewStatus();
  const ModeIcon = MODE_ICON[interview.mode];

  function setStatus(status: InterviewTerminalStatus) {
    updateStatus.mutate(
      { applicationId: interview.applicationId, interviewId: interview.id, status },
      {
        onSuccess: () => toast.success(t('interview.toast.statusUpdated')),
        onError: () => toast.error(t('interview.toast.error')),
      }
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary tabular-nums">
          <Clock size={14} className="text-text-muted shrink-0" />
          {formatWhen(interview.scheduledAt, locale)}
          <span className="text-text-muted font-normal">· {interview.durationMin}m</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InterviewStatusBadge status={interview.status} />
          {interview.status === 'SCHEDULED' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={t('interview.changeStatus')}
                  disabled={updateStatus.isPending}
                >
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TERMINAL_STATUSES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
                    {t(`interview.setStatus.${s}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
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

      {interview.interviewers.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-text-muted">{t('interview.interviewersLabel')}:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {interview.interviewers.map((iv) => (
              <span
                key={iv.employeeId}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt py-0.5 pl-0.5 pr-2"
              >
                <Avatar style={{ width: 20, height: 20 }}>
                  <AvatarImage src={iv.avatar ?? undefined} alt={iv.fullName} />
                  <AvatarFallback style={{ fontSize: 9 }}>
                    {getInitials(iv.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-text-secondary">{iv.fullName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {updateStatus.isPending && (
        <p className="mt-1 text-xs text-text-muted">{tc('states.saving')}</p>
      )}

      {interview.status !== 'CANCELLED' && interview.status !== 'NO_SHOW' && (
        <ScorecardPanel interview={interview} applicationId={interview.applicationId} />
      )}
    </div>
  );
}

function ScheduleForm({
  applicationId,
  onDone,
}: {
  applicationId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const createInterview = useCreateInterview(applicationId);

  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [mode, setMode] = useState<InterviewMode>(InterviewModeEnum.VIDEO);
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [selected, setSelected] = useState<
    { id: string; fullName: string; avatar: string | null }[]
  >([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading } = useEmployees({ search, status: 'ACTIVE', limit: 20 });
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const candidates = (data?.data ?? []).filter((e) => !selectedIds.has(e.id));

  function toggle(emp: { id: string; fullName: string; avatar: string | null }) {
    setSelected((prev) => [...prev, { id: emp.id, fullName: emp.fullName, avatar: emp.avatar }]);
    setSearchInput('');
  }

  const canSubmit = !!scheduledAt && selected.length > 0 && !createInterview.isPending;

  function submit() {
    if (!scheduledAt || selected.length === 0) return;
    const payload: CreateInterviewRequest = {
      applicationId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationMin,
      mode,
      interviewerIds: selected.map((s) => s.id),
    };
    if (mode === 'ONSITE' && location.trim()) payload.location = location.trim();
    if (mode !== 'ONSITE' && meetingUrl.trim()) payload.meetingUrl = meetingUrl.trim();

    createInterview.mutate(payload, {
      onSuccess: () => {
        toast.success(t('interview.toast.scheduled'));
        onDone();
      },
      onError: () => toast.error(t('interview.toast.error')),
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface-alt/50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="iv-when">
            {t('interview.form.scheduledAt')} <span className="text-danger">*</span>
          </Label>
          <Input
            id="iv-when"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iv-duration">{t('interview.form.durationMin')}</Label>
          <Input
            id="iv-duration"
            type="number"
            min={5}
            max={600}
            step={5}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="h-9 text-sm tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('interview.form.mode')}</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as InterviewMode)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`interview.mode.${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === 'ONSITE' ? (
        <div className="space-y-1.5">
          <Label htmlFor="iv-location">{t('interview.form.location')}</Label>
          <Input
            id="iv-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('interview.form.locationPlaceholder')}
            maxLength={255}
            className="h-9 text-sm"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="iv-url">{t('interview.form.meetingUrl')}</Label>
          <Input
            id="iv-url"
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder={t('interview.form.meetingUrlPlaceholder')}
            maxLength={500}
            className="h-9 text-sm"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>
          {t('interview.form.interviewers')} <span className="text-danger">*</span>
        </Label>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pl-0.5 pr-1.5"
              >
                <Avatar style={{ width: 20, height: 20 }}>
                  <AvatarImage src={s.avatar ?? undefined} alt={s.fullName} />
                  <AvatarFallback style={{ fontSize: 9 }}>
                    {getInitials(s.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-text-primary">{s.fullName}</span>
                <button
                  type="button"
                  onClick={() => setSelected((prev) => prev.filter((p) => p.id !== s.id))}
                  aria-label={t('interview.form.removeInterviewer', { name: s.fullName })}
                  className="text-text-muted hover:text-danger transition-colors"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('interview.form.interviewerSearch')}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {searchInput && (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {isLoading ? (
              <p className="px-2 py-4 text-center text-xs text-text-muted">
                {tc('states.loading')}
              </p>
            ) : candidates.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-text-muted">
                {tc('states.noResults')}
              </p>
            ) : (
              candidates.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggle(emp)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-alt transition-colors"
                >
                  <Avatar style={{ width: 28, height: 28 }}>
                    <AvatarImage src={emp.avatar ?? undefined} alt={emp.fullName} />
                    <AvatarFallback style={{ fontSize: 11 }}>
                      {getInitials(emp.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {emp.fullName}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {emp.department?.name ?? t('job.hiringTeam.noDepartment')}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {tc('actions.cancel')}
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
          {createInterview.isPending ? tc('states.saving') : t('interview.form.submit')}
        </Button>
      </div>
    </div>
  );
}

export function InterviewScheduler({
  applicationId,
  canSchedule,
}: {
  applicationId: string;
  canSchedule: boolean;
}) {
  const { t } = useTranslation('recruitment');
  const { data: interviews, isLoading, error } = useApplicationInterviews(applicationId);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {t('interview.title')}
        </h3>
        {canSchedule && !formOpen && (
          <Button variant="outline" size="sm" className="h-7" onClick={() => setFormOpen(true)}>
            <CalendarPlus size={13} className="mr-1.5" />
            {t('interview.schedule')}
          </Button>
        )}
      </div>

      {canSchedule && formOpen && (
        <div className="mb-3">
          <ScheduleForm applicationId={applicationId} onDone={() => setFormOpen(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{t('interview.loadError')}</p>
      ) : !interviews || interviews.length === 0 ? (
        <p className="text-sm text-text-muted">{t('interview.empty')}</p>
      ) : (
        <div className="space-y-2">
          {interviews.map((iv) => (
            <InterviewRow key={iv.id} interview={iv} />
          ))}
        </div>
      )}
    </div>
  );
}
