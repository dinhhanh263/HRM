import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ProbationReviewStatus,
  ProbationReviewDto,
} from '@hrm/shared';
import { getApiErrorCode } from '@/lib/api-error';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { Plus, ClipboardCheck } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth.store';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { ProbationStatusBadge } from './ProbationStatusBadge';
import { ProbationScorecardSheet } from './ProbationScorecardSheet';
import { useProbationReviews, useCreateProbationReview } from '../hooks/useProbation';

const STATUS_OPTIONS: ProbationReviewStatus[] = [
  'DRAFT',
  'PENDING_HR',
  'DECIDED',
  'CANCELLED',
];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Format an ISO date as dd/MM/yyyy (UTC-based to match server day math). */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function ProbationReviewList() {
  const { t } = useTranslation('probation');
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ProbationReviewStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialEmployeeId, setCreateInitialEmployeeId] = useState<string | undefined>();
  const [selected, setSelected] = useState<ProbationReviewDto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useProbationReviews(
    status === 'ALL' ? {} : { status }
  );
  const reviews = data?.data ?? [];

  // SPEC-034 §4 — ?employee=<id> (dashboard "probation ending" event) drops the
  // reviewer straight into the action: the employee's open review if one
  // exists, else the create dialog preselected. Looked up by employeeId (not in
  // the page-1 list — the open review may sit beyond the default page size).
  // Consumed once (replace) so closing the dialog/sheet doesn't re-trigger it.
  const deepLinkTarget = searchParams.get('employee');
  const { data: targetData, isLoading: targetLoading } = useProbationReviews(
    deepLinkTarget ? { employeeId: deepLinkTarget } : {}
  );

  useEffect(() => {
    if (!deepLinkTarget || targetLoading) return;

    const next = new URLSearchParams(searchParams);
    next.delete('employee');
    setSearchParams(next, { replace: true });

    const openReviewForTarget = (targetData?.data ?? []).find(
      (r) =>
        r.employee.id === deepLinkTarget &&
        (r.status === 'DRAFT' || r.status === 'PENDING_HR')
    );
    if (openReviewForTarget) {
      setSelected(openReviewForTarget);
      setSheetOpen(true);
    } else if (can('probation:review')) {
      setCreateInitialEmployeeId(deepLinkTarget);
      setCreateOpen(true);
    }
  }, [deepLinkTarget, targetLoading, targetData, searchParams, setSearchParams, can]);

  function openReview(review: ProbationReviewDto) {
    setSelected(review);
    setSheetOpen(true);
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ProbationReviewStatus | 'ALL')}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('reviews.filter.all')}</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Can permission="probation:review">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            {t('reviews.create')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <ClipboardCheck className="size-5 text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">{t('reviews.empty.title')}</p>
          <p className="text-xs text-text-muted max-w-xs mb-4">{t('reviews.empty.description')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('reviews.columns.employee')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('reviews.columns.probationEnd')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('reviews.columns.reviewer')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('reviews.columns.recommendation')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('reviews.columns.status')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">
                {t('reviews.columns.created')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => (
              <TableRow
                key={r.id}
                className="group h-14 hover:bg-background cursor-pointer"
                onClick={() => openReview(r)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={r.employee.avatar || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(r.employee.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-text-primary leading-none">
                        {r.employee.fullName}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{r.employee.employeeCode}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm tabular-nums text-text-secondary">
                  {formatDate(r.employee.probationEndDate)}
                </TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {r.reviewer?.fullName ?? t('reviews.noReviewer')}
                </TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {r.recommendation
                    ? t(`outcome.${r.recommendation}`)
                    : t('reviews.noRecommendation')}
                </TableCell>
                <TableCell className="text-center">
                  <ProbationStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-text-secondary">
                  {formatDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateReviewDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          // Forget the deep-link preselection once the dialog closes so the
          // toolbar button opens a clean picker afterwards.
          if (!open) setCreateInitialEmployeeId(undefined);
        }}
        initialEmployeeId={createInitialEmployeeId}
      />
      <ProbationScorecardSheet
        review={selected ? reviews.find((r) => r.id === selected.id) ?? selected : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

function CreateReviewDialog({
  open,
  onOpenChange,
  initialEmployeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmployeeId?: string;
}) {
  const { t } = useTranslation('probation');
  const [employeeId, setEmployeeId] = useState('');
  const createMutation = useCreateProbationReview();

  // Deep-link preselection (SPEC-034 §4): applied on open; the user can still
  // change it. Re-runs only on open/preselection change, never on manual picks.
  useEffect(() => {
    if (open) setEmployeeId(initialEmployeeId ?? '');
  }, [open, initialEmployeeId]);

  // Probationary, active employees are the only valid review targets. A manager
  // (no tenant-wide probation:decide) only reviews direct reports — mirror the
  // server scope in the picker so they never see candidates they can't pick (SPEC-033 §2b).
  const { can } = usePermission();
  const myEmployeeId = useAuthStore((s) => s.user?.employee?.id);
  const teamScoped = !can('probation:decide');
  // Manager không gắn hồ sơ employee thì không có report nào — đừng rơi về query
  // tenant-wide (sẽ hiện ứng viên ngoài team mà chọn là 403).
  const noTeam = teamScoped && !myEmployeeId;
  const { data: employeeData, isLoading } = useEmployees({
    contractType: 'PROBATION',
    status: 'ACTIVE',
    limit: 100,
    ...(teamScoped && myEmployeeId ? { managerId: myEmployeeId } : {}),
  });
  const candidates = noTeam ? [] : (employeeData?.data ?? []);

  function submit() {
    if (!employeeId) return;
    createMutation.mutate(
      { employeeId },
      {
        onSuccess: () => {
          toast.success(t('reviews.toast.created'));
          setEmployeeId('');
          onOpenChange(false);
        },
        onError: (error) => {
          const code = getApiErrorCode(error);
          const description =
            code === 'PROBATION_REVIEW_OPEN_EXISTS'
              ? t('reviews.toast.openExists')
              : code === 'PROBATION_EMPLOYEE_NOT_ON_PROBATION'
                ? t('reviews.toast.notOnProbation')
                : t('toast.tryAgain');
          toast.error(t('reviews.toast.createError'), { description });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reviews.createDialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {t('reviews.createDialog.employee')} <span className="text-danger">*</span>
          </Label>
          {!isLoading && candidates.length === 0 ? (
            <p className="text-sm text-text-muted py-2">
              {t('reviews.createDialog.noCandidates')}
            </p>
          ) : (
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t('reviews.createDialog.employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName} · {e.employeeCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={submit} disabled={!employeeId || createMutation.isPending}>
            {t('reviews.createDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
