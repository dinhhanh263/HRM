import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpendingPlanDto, SpendingPlanStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { formatVnd } from '@/lib/utils';
import { Plus, Send, Pencil, ClipboardList, Check, X, Eye } from 'lucide-react';
import {
  useSpendingPlans,
  useCreateSpendingPlan,
  useUpdateSpendingPlan,
  useSubmitSpendingPlan,
  useReviewSpendingPlan,
} from '../hooks/useSpendingPlans';
import { SpendingPlanFormSheet, type SpendingPlanFormData } from '../components/SpendingPlanFormSheet';

const STATUS_CLASS: Record<SpendingPlanStatus, string> = {
  DRAFT: 'bg-surface-alt text-text-secondary',
  SUBMITTED: 'bg-warning-light text-warning',
  APPROVED: 'bg-success-light text-success',
  REJECTED: 'bg-danger-light text-danger',
};

export function SpendingPlanStatusBadge({ status }: { status: SpendingPlanStatus }) {
  const { t } = useTranslation('finance');
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {t(`plans.status.${status}`)}
    </span>
  );
}

export function SpendingPlansPage() {
  const { can } = usePermission();
  // HR/Finance (approver) get the company-wide review view; others get their own dept.
  return can('spending_plan:approve') ? <HrReviewView /> : <ManagerView />;
}

// ── Detail sheet (read-only items) ────────────────────────────────────────────
function PlanDetailSheet({ plan, onOpenChange }: { plan: SpendingPlanDto | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('finance');
  return (
    <Sheet open={!!plan} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{plan?.departmentName} · {plan?.period}</SheetTitle>
          <SheetDescription>{plan?.issuingEntityName}</SheetDescription>
        </SheetHeader>
        {plan && (
          <div className="mt-6 space-y-2">
            {plan.status === 'REJECTED' && plan.reviewNote && (
              <p className="text-sm text-danger">↩ {plan.reviewNote}</p>
            )}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {plan.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm text-text-primary block truncate">{it.title}</span>
                    <span className="text-xs text-text-muted">
                      {it.categoryName ?? t('plans.form.noCategory')}
                      {it.expectedDate ? ` · ${it.expectedDate.slice(0, 10)}` : ''}
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-text-primary shrink-0">{formatVnd(it.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-text-secondary">{t('plans.form.total')}</span>
              <span className="text-base font-bold tabular-nums text-text-primary">{formatVnd(plan.totalAmount)}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── HR / Finance: review company-wide ─────────────────────────────────────────
function HrReviewView() {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const [status, setStatus] = useState<string>('SUBMITTED');
  const [detail, setDetail] = useState<SpendingPlanDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SpendingPlanDto | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data = [], isLoading } = useSpendingPlans({ scope: 'all', status: status === 'ALL' ? undefined : (status as SpendingPlanStatus) });
  const reviewMutation = useReviewSpendingPlan();

  const totalPlanned = useMemo(() => data.reduce((s, p) => s + Number(p.totalAmount), 0), [data]);

  function approve(p: SpendingPlanDto) {
    reviewMutation.mutate(
      { id: p.id, decision: 'APPROVED' },
      { onSuccess: () => toast.success(t('plans.toast.approved')), onError: () => toast.error(t('plans.toast.reviewError')) },
    );
  }
  function confirmReject() {
    if (!rejectTarget || !rejectNote.trim()) return;
    reviewMutation.mutate(
      { id: rejectTarget.id, decision: 'REJECTED', note: rejectNote.trim() },
      {
        onSuccess: () => {
          toast.success(t('plans.toast.rejected'));
          setRejectTarget(null);
          setRejectNote('');
        },
        onError: () => toast.error(t('plans.toast.reviewError')),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('plans.reviewTitle')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('plans.reviewSubtitle')}</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SUBMITTED">{t('plans.status.SUBMITTED')}</SelectItem>
            <SelectItem value="APPROVED">{t('plans.status.APPROVED')}</SelectItem>
            <SelectItem value="REJECTED">{t('plans.status.REJECTED')}</SelectItem>
            <SelectItem value="ALL">{t('plans.filters.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
          <span className="text-xs text-text-muted">{t('plans.reviewCount', { count: data.length })}</span>
          <span className="text-xs text-text-muted">
            {t('plans.totalPlanned')}: <span className="font-semibold text-text-primary tabular-nums">{formatVnd(totalPlanned)}</span>
          </span>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
        ) : data.length === 0 ? (
          <p className="py-14 text-center text-sm text-text-muted">{t('plans.reviewEmpty')}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-border border-b-2 border-border-strong">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider">{t('plans.table.department')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[100px]">{t('plans.table.period')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[120px]">{t('plans.table.status')}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[140px]">{t('plans.table.total')}</th>
                <th className="px-4 py-3 w-[220px]" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-surface-alt bg-surface">
                  <td className="px-4 py-3 border-b border-border">
                    <span className="font-medium text-text-primary">{p.departmentName}</span>
                    <span className="block text-xs text-text-muted">{p.issuingEntityName} · {p.items.length} {t('plans.table.itemsSuffix')}</span>
                  </td>
                  <td className="px-4 py-3 border-b border-border tabular-nums text-text-secondary">{p.period}</td>
                  <td className="px-4 py-3 border-b border-border"><SpendingPlanStatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 border-b border-border text-right font-semibold tabular-nums text-text-primary">{formatVnd(p.totalAmount)}</td>
                  <td className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(p)}>
                        <Eye className="size-3.5 mr-1" />{t('plans.actions.detail')}
                      </Button>
                      {p.status === 'SUBMITTED' && (
                        <>
                          <Button size="sm" className="h-8" disabled={reviewMutation.isPending} onClick={() => approve(p)}>
                            <Check className="size-3.5 mr-1" />{t('plans.actions.approve')}
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-danger" onClick={() => { setRejectTarget(p); setRejectNote(''); }}>
                            <X className="size-3.5 mr-1" />{t('plans.actions.reject')}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PlanDetailSheet plan={detail} onOpenChange={(o) => !o && setDetail(null)} />

      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('plans.reject.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('plans.reject.description', { name: rejectTarget?.departmentName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t('plans.reject.placeholder')} />
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              disabled={!rejectNote.trim() || reviewMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {t('plans.actions.reject')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Manager: own-department plans ─────────────────────────────────────────────
function ManagerView() {
  const { t } = useTranslation('finance');
  const { data = [], isLoading } = useSpendingPlans({ scope: 'mine' });
  const createMutation = useCreateSpendingPlan();
  const updateMutation = useUpdateSpendingPlan();
  const submitMutation = useSubmitSpendingPlan();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpendingPlanDto | null>(null);
  const [detail, setDetail] = useState<SpendingPlanDto | null>(null);

  function handleSubmit(form: SpendingPlanFormData) {
    const done = (msg: string) => { toast.success(msg); setSheetOpen(false); };
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, items: form.items, period: form.period, issuingEntityId: form.issuingEntityId },
        { onSuccess: () => done(t('plans.toast.updated')), onError: () => toast.error(t('plans.toast.saveError')) },
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => done(t('plans.toast.created')),
        onError: (err: unknown) => {
          const s = (err as { response?: { status?: number } })?.response?.status;
          toast.error(s === 409 ? t('plans.toast.duplicate') : s === 403 ? t('plans.toast.forbidden') : t('plans.toast.saveError'));
        },
      });
    }
  }
  function submitPlan(p: SpendingPlanDto) {
    submitMutation.mutate(p.id, {
      onSuccess: () => toast.success(t('plans.toast.submitted')),
      onError: () => toast.error(t('plans.toast.saveError')),
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('plans.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('plans.subtitle')}</p>
        </div>
        <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />{t('plans.form.create')}
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
              <ClipboardList className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-primary font-medium">{t('plans.empty.title')}</p>
            <p className="text-text-muted text-sm mt-2">{t('plans.empty.description')}</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-border border-b-2 border-border-strong">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider">{t('plans.table.department')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[110px]">{t('plans.table.period')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[130px]">{t('plans.table.status')}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[150px]">{t('plans.table.total')}</th>
                <th className="px-4 py-3 w-[220px]" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const editable = p.status === 'DRAFT' || p.status === 'REJECTED';
                return (
                  <tr key={p.id} className="hover:bg-surface-alt bg-surface align-top">
                    <td className="px-4 py-3 border-b border-border">
                      <span className="font-medium text-text-primary">{p.departmentName}</span>
                      <span className="block text-xs text-text-muted">{p.issuingEntityName} · {p.items.length} {t('plans.table.itemsSuffix')}</span>
                      {p.status === 'REJECTED' && p.reviewNote && <span className="block text-xs text-danger mt-1">↩ {p.reviewNote}</span>}
                    </td>
                    <td className="px-4 py-3 border-b border-border tabular-nums text-text-secondary">{p.period}</td>
                    <td className="px-4 py-3 border-b border-border"><SpendingPlanStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 border-b border-border text-right font-semibold tabular-nums text-text-primary">{formatVnd(p.totalAmount)}</td>
                    <td className="px-4 py-3 border-b border-border">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(p)}>
                          <Eye className="size-3.5 mr-1" />{t('plans.actions.detail')}
                        </Button>
                        {editable && (
                          <>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => { setEditing(p); setSheetOpen(true); }}>
                              <Pencil className="size-3.5 mr-1" />{t('plans.actions.edit')}
                            </Button>
                            <Button size="sm" className="h-8" disabled={submitMutation.isPending} onClick={() => submitPlan(p)}>
                              <Send className="size-3.5 mr-1" />{t('plans.actions.submit')}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SpendingPlanFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        plan={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
      <PlanDetailSheet plan={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
