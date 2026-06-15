import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  GitBranch,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { JobDto, JobListItemDto, JobListParams, JobStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { usePositions } from '@/features/positions/hooks/usePositions';
import { useJobs, useCreateJob, useUpdateJob, useChangeJobStatus } from '../hooks/useJobs';
import { usePipelineTemplates } from '../hooks/usePipelineTemplates';
import { JobStatusBadge } from '../components/JobStatusBadge';
import { JobFormSheet, NONE_VALUE, type JobFormData } from '../components/JobFormSheet';

const ALL = 'all';
const JOB_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

// Mirrors the backend STATUS_TRANSITIONS so the UI only offers legal moves.
const STATUS_ACTIONS: Record<JobStatus, { status: JobStatus; labelKey: string }[]> = {
  DRAFT: [
    { status: 'OPEN', labelKey: 'job.actions.open' },
    { status: 'CANCELLED', labelKey: 'job.actions.cancel' },
  ],
  OPEN: [
    { status: 'ON_HOLD', labelKey: 'job.actions.hold' },
    { status: 'CLOSED', labelKey: 'job.actions.close' },
    { status: 'CANCELLED', labelKey: 'job.actions.cancel' },
  ],
  ON_HOLD: [
    { status: 'OPEN', labelKey: 'job.actions.reopen' },
    { status: 'CLOSED', labelKey: 'job.actions.close' },
    { status: 'CANCELLED', labelKey: 'job.actions.cancel' },
  ],
  CLOSED: [
    { status: 'OPEN', labelKey: 'job.actions.reopen' },
    { status: 'CANCELLED', labelKey: 'job.actions.cancel' },
  ],
  CANCELLED: [],
};

function JobActionsMenu({
  job,
  onEdit,
  onChangeStatus,
}: {
  job: JobListItemDto;
  onEdit: (job: JobListItemDto) => void;
  onChangeStatus: (job: JobListItemDto, status: JobStatus) => void;
}) {
  const { t } = useTranslation('recruitment');
  const transitions = STATUS_ACTIONS[job.status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t('job.actions.edit')}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(job)}>{t('job.actions.edit')}</DropdownMenuItem>
        {transitions.length > 0 && <DropdownMenuSeparator />}
        {transitions.map((action) => (
          <DropdownMenuItem
            key={action.status}
            className={action.status === 'CANCELLED' ? 'text-danger focus:text-danger' : ''}
            onClick={() => onChangeStatus(job, action.status)}
          >
            {t(action.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function JobListPage() {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canCreate = can('recruitment:job_create');
  const canUpdate = can('recruitment:job_update');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<JobDto | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Deep-link from the command palette: ?new=1 opens the create sheet.
  useEffect(() => {
    if (searchParams.get('new') === '1' && canCreate) {
      setEditing(null);
      setSheetOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, canCreate, setSearchParams]);

  const params = useMemo<JobListParams>(() => {
    const p: JobListParams = {};
    if (search) p.search = search;
    if (statusFilter !== ALL) p.status = statusFilter as JobStatus;
    if (departmentFilter !== ALL) p.departmentId = departmentFilter;
    return p;
  }, [search, statusFilter, departmentFilter]);

  const { data, isLoading, error } = useJobs(params);
  const { data: departments } = useDepartments();
  const { data: positions } = usePositions();
  const { data: templates } = usePipelineTemplates();
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob(editing?.id ?? '');
  const changeStatusMutation = useChangeJobStatus();

  const hasFilters = search !== '' || statusFilter !== ALL || departmentFilter !== ALL;

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(job: JobListItemDto) {
    // The list item carries enough for the edit form (which hides pipeline/status).
    setEditing(job as JobDto);
    setSheetOpen(true);
  }

  function handleSubmit(formData: JobFormData) {
    const departmentId = formData.departmentId === NONE_VALUE ? null : formData.departmentId;
    const positionId = formData.positionId === NONE_VALUE ? null : formData.positionId;

    if (editing) {
      updateMutation.mutate(
        {
          title: formData.title,
          description: formData.description || null,
          departmentId,
          positionId,
          employmentType: formData.employmentType,
          location: formData.location || null,
          headcount: formData.headcount,
        },
        {
          onSuccess: () => {
            toast.success(t('job.toast.updated'));
            setSheetOpen(false);
          },
          onError: () => toast.error(t('job.toast.error')),
        }
      );
    } else {
      createMutation.mutate(
        {
          title: formData.title,
          description: formData.description || undefined,
          departmentId: departmentId ?? undefined,
          positionId: positionId ?? undefined,
          employmentType: formData.employmentType,
          location: formData.location || undefined,
          headcount: formData.headcount,
          pipelineTemplateId: formData.pipelineTemplateId,
          status: formData.status,
        },
        {
          onSuccess: () => {
            toast.success(t('job.toast.created'));
            setSheetOpen(false);
          },
          onError: () => toast.error(t('job.toast.error')),
        }
      );
    }
  }

  function handleChangeStatus(job: JobListItemDto, status: JobStatus) {
    changeStatusMutation.mutate(
      { id: job.id, status },
      {
        onSuccess: () => toast.success(t('job.toast.statusChanged')),
        onError: () => toast.error(t('job.toast.error')),
      }
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      {/* Page Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0">
            {t('job.list.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('job.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/recruitment/pipelines">
              <GitBranch size={14} className="mr-1.5" />
              {t('job.list.managePipelines')}
            </Link>
          </Button>
          {canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} className="mr-1.5" />
              {t('job.list.create')}
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
          <Input
            placeholder={t('job.list.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`pl-8 h-9 w-64 text-sm ${searchInput ? 'pr-7' : ''}`}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              aria-label={tc('actions.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('job.filters.allStatuses')}</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`job.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('job.filters.allDepartments')}</SelectItem>
            {(departments ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data && (
          <p className="text-xs text-text-muted ml-auto shrink-0">
            <span className="font-medium text-text-primary tabular-nums">{data.length}</span>{' '}
            {t('job.list.count')}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-1/2 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-1/3 rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border bg-surface">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{tc('states.error')}</p>
          <p className="text-text-muted text-sm mt-1">{t('job.list.loadError')}</p>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Briefcase size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">
            {hasFilters ? t('job.empty.noResultTitle') : t('job.empty.title')}
          </h3>
          <p className="text-sm text-text-secondary max-w-xs mb-4">
            {hasFilters ? t('job.empty.noResultDescription') : t('job.empty.description')}
          </p>
          {!hasFilters && canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} className="mr-1.5" />
              {t('job.list.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((job) => (
            <div
              key={job.id}
              className="group rounded-lg border border-border bg-surface p-4 transition-all duration-150 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/recruitment/jobs/${job.id}`}
                    className="font-semibold text-text-primary truncate hover:text-primary transition-colors block"
                  >
                    {job.title}
                  </Link>
                  <p className="text-xs text-text-muted mt-0.5 truncate">
                    {job.department?.name ?? t('job.list.noDepartment')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <JobStatusBadge status={job.status} />
                  {canUpdate && (
                    <JobActionsMenu
                      job={job}
                      onEdit={openEdit}
                      onChangeStatus={handleChangeStatus}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Briefcase size={12} className="text-text-muted" />
                  {t(`job.employmentType.${job.employmentType}`)}
                </span>
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} className="text-text-muted" />
                    {job.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users size={12} className="text-text-muted" />
                  {t('job.list.headcount', { count: job.headcount })}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={12} />
                  {t('job.list.stageCount', { count: job.stageCount })}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {t('job.list.activeApplications', { count: job.activeApplicationCount })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <JobFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        job={editing}
        departments={departments ?? []}
        positions={positions ?? []}
        templates={templates ?? []}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
