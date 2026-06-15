import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import {
  Plus,
  MoreHorizontal,
  RefreshCw,
  Send,
  CheckCircle2,
  Undo2,
  Banknote,
  XCircle,
  CalendarClock,
} from 'lucide-react';
import type { PayrollRunDto, PermissionKey } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermission } from '@/hooks/usePermission';
import { cn, formatVnd } from '@/lib/utils';
import {
  useRuns,
  useCreateRun,
  useRecomputeRun,
  useSubmitRun,
  useApproveRun,
  useRejectRun,
  useMarkRunPaid,
  useCancelRun,
} from '../hooks/useRuns';
import { PayrollRunStatusBadge } from './PayrollRunStatusBadge';
import { RunDetailSheet } from './RunDetailSheet';

type ActionKey = 'recompute' | 'submit' | 'approve' | 'reject' | 'mark-paid' | 'cancel';

// Which transitions a run offers, by status. PAID/CANCELLED runs are read-only
// (a new run for the period is created via the toolbar). Guards are re-checked
// server-side; this only shapes the menu.
const ACTIONS_BY_STATUS: Record<PayrollRunDto['status'], ActionKey[]> = {
  DRAFT: ['recompute', 'submit', 'cancel'],
  PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
  APPROVED: ['mark-paid', 'cancel'],
  PAID: [],
  CANCELLED: [],
};

// Maker-checker split: process (HR) drives the draft + payment edges; approve
// (the checker) drives approve/reject. The menu only shows an action the caller
// is actually allowed to perform — the server enforces the same split.
const ACTION_PERMISSION: Record<ActionKey, PermissionKey> = {
  recompute: 'payroll:process',
  submit: 'payroll:process',
  approve: 'payroll:approve',
  reject: 'payroll:approve',
  'mark-paid': 'payroll:process',
  cancel: 'payroll:process',
};

const ACTION_ICON: Record<ActionKey, typeof RefreshCw> = {
  recompute: RefreshCw,
  submit: Send,
  approve: CheckCircle2,
  reject: Undo2,
  'mark-paid': Banknote,
  cancel: XCircle,
};

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export function RunsSheet() {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  const canManage = can('payroll:process');

  const [period, setPeriod] = useState(currentPeriod);
  const [pending, setPending] = useState<{ run: PayrollRunDto; action: ActionKey } | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  const { data, isLoading } = useRuns({ page: 1, limit: 50 });
  const createRun = useCreateRun();
  const recompute = useRecomputeRun();
  const submit = useSubmitRun();
  const approve = useApproveRun();
  const reject = useRejectRun();
  const markPaid = useMarkRunPaid();
  const cancel = useCancelRun();

  const mutationFor: Record<ActionKey, ReturnType<typeof useRecomputeRun>> = {
    recompute,
    submit,
    approve,
    reject,
    'mark-paid': markPaid,
    cancel,
  };

  async function onCreate() {
    try {
      await createRun.mutateAsync({ period });
      toast.success(t('runs.toast.created'));
    } catch {
      toast.error(t('runs.toast.createError'), { description: t('runs.toast.createErrorBody') });
    }
  }

  async function onConfirm() {
    if (!pending) return;
    const { run, action } = pending;
    try {
      await mutationFor[action].mutateAsync(run.id);
      toast.success(t(`runs.toast.${action}.success`));
    } catch {
      toast.error(t(`runs.toast.${action}.error`));
    } finally {
      setPending(null);
    }
  }

  const rows = data?.rows ?? [];
  const isBusy = pending ? mutationFor[pending.action].isPending : false;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-background">
        <p className="text-xs text-text-muted">{t('runs.hint')}</p>
        {canManage && (
          <div className="flex items-center gap-2">
            <Input
              type="month"
              className="h-8 w-40 text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label={t('runs.period')}
            />
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!period || createRun.isPending}
              onClick={onCreate}
            >
              <Plus className="size-3.5" />
              {t('runs.create')}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-3.5 w-20 rounded" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-24 rounded ml-auto" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <CalendarClock className="size-6 text-text-muted" />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('runs.empty.title')}</h3>
          <p className="text-sm text-text-muted max-w-xs">{t('runs.empty.body')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-alt hover:bg-surface-alt">
              <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('runs.columns.period')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('runs.columns.status')}
              </TableHead>
              <TableHead className="text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('runs.columns.headcount')}
              </TableHead>
              <TableHead className="text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('runs.columns.totalGross')}
              </TableHead>
              <TableHead className="text-right text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('runs.columns.totalNet')}
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((run) => {
              const actions = ACTIONS_BY_STATUS[run.status].filter((a) =>
                can(ACTION_PERMISSION[a]),
              );
              return (
                <TableRow key={run.id} className="group h-12 hover:bg-surface-alt/50">
                  <TableCell className="text-sm font-medium tabular-nums">
                    <button
                      type="button"
                      onClick={() => setDetailRunId(run.id)}
                      className="text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                    >
                      {run.period}
                    </button>
                  </TableCell>
                  <TableCell>
                    <PayrollRunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{run.headcount}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {formatVnd(run.totalGross)} ₫
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatVnd(run.totalNet)} ₫
                  </TableCell>
                  <TableCell>
                    {actions.length > 0 && (
                      <div
                        className={cn(
                          'flex justify-end opacity-0 group-hover:opacity-100',
                          'focus-within:opacity-100 transition-opacity',
                        )}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label={t('runs.actions.menu')}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map((action) => {
                              const Icon = ACTION_ICON[action];
                              return (
                                <DropdownMenuItem
                                  key={action}
                                  onClick={() => setPending({ run, action })}
                                  className={cn(action === 'cancel' && 'text-destructive')}
                                >
                                  <Icon className="size-3.5 mr-2" />
                                  {t(`runs.actions.${action}`)}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending &&
                t(`runs.confirm.${pending.action}.title`, { period: pending.run.period })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending &&
                t(`runs.confirm.${pending.action}.body`, { period: pending.run.period })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('runs.confirm.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              className={cn(pending?.action === 'cancel' && 'bg-destructive hover:bg-destructive/90')}
            >
              {pending && t(`runs.confirm.${pending.action}.confirmButton`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RunDetailSheet
        open={!!detailRunId}
        onOpenChange={(o) => !o && setDetailRunId(null)}
        runId={detailRunId}
      />
    </div>
  );
}
