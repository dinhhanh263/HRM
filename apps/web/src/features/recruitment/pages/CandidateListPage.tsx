import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  UserSearch,
  X,
} from 'lucide-react';
import type {
  CandidateListItemDto,
  CandidateListParams,
  CandidateSource,
  CreateCandidateRequest,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getInitials } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useCandidates, useCreateCandidate } from '../hooks/useCandidates';
import { CandidateFormSheet } from '../components/CandidateFormSheet';

const ALL = 'all';
const MIN_EXP_OPTIONS = [1, 2, 3, 5, 8] as const;
const CANDIDATE_SOURCES: CandidateSource[] = [
  'CAREER_SITE',
  'JOB_BOARD',
  'REFERRAL',
  'SOURCED',
  'AGENCY',
  'EVENT',
  'DIRECT',
];

export function CandidateListPage() {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { can } = usePermission();
  const canCreate = can('recruitment:candidate_create');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [skillsInput, setSkillsInput] = useState('');
  const [skills, setSkills] = useState('');
  const [minExpFilter, setMinExpFilter] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link from the command palette: ?new=1 opens the create sheet.
  useEffect(() => {
    if (searchParams.get('new') === '1' && canCreate) {
      setSheetOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, canCreate, setSearchParams]);

  // Debounce the free-text inputs so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setSkills(skillsInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, skillsInput]);

  const skillsList = useMemo(
    () =>
      skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [skills]
  );

  const params = useMemo<CandidateListParams>(() => {
    const p: CandidateListParams = { page, limit: 20 };
    if (search) p.search = search;
    if (sourceFilter !== ALL) p.source = sourceFilter as CandidateSource;
    if (skillsList.length) p.skills = skillsList;
    if (minExpFilter !== ALL) p.minExp = Number(minExpFilter);
    return p;
  }, [search, sourceFilter, skillsList, minExpFilter, page]);

  const { data, isLoading, error } = useCandidates(params);
  const createMutation = useCreateCandidate();

  const hasFilters =
    search !== '' || sourceFilter !== ALL || skillsList.length > 0 || minExpFilter !== ALL;
  const rows = data?.data ?? [];

  async function handleSubmit(payload: CreateCandidateRequest) {
    await createMutation.mutateAsync(payload);
    toast.success(t('candidate.toast.created'));
    setSheetOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      {/* Page Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary m-0">
            {t('candidate.list.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('candidate.list.subtitle')}</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            {t('candidate.list.create')}
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
          <Input
            placeholder={t('candidate.list.searchPlaceholder')}
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

        <div className="relative">
          <Input
            placeholder={t('candidate.filters.skillsPlaceholder')}
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            className={`h-9 w-52 text-sm ${skillsInput ? 'pr-7' : ''}`}
          />
          {skillsInput && (
            <button
              onClick={() => setSkillsInput('')}
              aria-label={tc('actions.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('candidate.filters.allSources')}</SelectItem>
            {CANDIDATE_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`candidate.source.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={minExpFilter}
          onValueChange={(v) => {
            setMinExpFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('candidate.filters.anyExp')}</SelectItem>
            {MIN_EXP_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {t('candidate.filters.minExp', { count: y })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data?.pagination && (
          <p className="text-xs text-text-muted ml-auto shrink-0">
            <span className="font-medium text-text-primary tabular-nums">
              {data.pagination.total}
            </span>{' '}
            {t('candidate.list.count')}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3.5 w-1/4 rounded" />
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border bg-surface">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{tc('states.error')}</p>
          <p className="text-text-muted text-sm mt-1">{t('candidate.list.loadError')}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-surface">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <UserSearch size={24} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">
            {hasFilters ? t('candidate.empty.noResultTitle') : t('candidate.empty.title')}
          </h3>
          <p className="text-sm text-text-secondary max-w-xs mb-4">
            {hasFilters ? t('candidate.empty.noResultDescription') : t('candidate.empty.description')}
          </p>
          {!hasFilters && canCreate && (
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('candidate.list.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {t('candidate.table.name')}
                </TableHead>
                <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {t('candidate.table.currentTitle')}
                </TableHead>
                <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {t('candidate.table.source')}
                </TableHead>
                <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide text-right">
                  {t('candidate.table.exp')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c: CandidateListItemDto) => (
                <TableRow key={c.id} className="group h-14 hover:bg-surface-alt/30">
                  <TableCell>
                    <Link to={`/recruitment/candidates/${c.id}`} className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                          {getInitials(c.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary leading-none group-hover:text-primary transition-colors truncate">
                          {c.fullName}
                        </p>
                        <p className="text-xs text-text-muted mt-1 truncate">
                          {c.email ?? c.phone ?? t('candidate.table.noContact')}
                        </p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {c.currentTitle ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {t(`candidate.source.${c.source}`)}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary text-right tabular-nums">
                    {c.totalYearsExp != null
                      ? t('candidate.table.years', { count: c.totalYearsExp })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data?.pagination && data.pagination.total > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
              <p className="text-xs text-text-secondary">
                {t('candidate.list.pagination.showing')}{' '}
                <span className="font-medium text-text-primary tabular-nums">
                  {(data.pagination.page - 1) * data.pagination.limit + 1}
                </span>
                {' – '}
                <span className="font-medium text-text-primary tabular-nums">
                  {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}
                </span>{' '}
                {t('candidate.list.pagination.of')}{' '}
                <span className="font-medium text-text-primary tabular-nums">
                  {data.pagination.total}
                </span>{' '}
                {t('candidate.list.pagination.suffix')}
              </p>

              {data.pagination.totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={data.pagination.page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-3.5" />
                    {t('candidate.list.pagination.prev')}
                  </Button>
                  <span className="text-xs text-text-muted px-2 min-w-[80px] text-center tabular-nums">
                    {data.pagination.page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={data.pagination.page === data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('candidate.list.pagination.next')}
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CandidateFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
