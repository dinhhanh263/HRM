import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpendingPlanDto, SpendingPlanStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import { formatVnd } from '@/lib/utils';
import { Plus, Send, Pencil, ClipboardList } from 'lucide-react';
import {
  useSpendingPlans,
  useCreateSpendingPlan,
  useUpdateSpendingPlan,
  useSubmitSpendingPlan,
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
  const { t } = useTranslation('finance');
  const { can } = usePermission();
  const canCreate = can('spending_plan:create');

  const { data = [], isLoading } = useSpendingPlans({ scope: 'mine' });
  const createMutation = useCreateSpendingPlan();
  const updateMutation = useUpdateSpendingPlan();
  const submitMutation = useSubmitSpendingPlan();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpendingPlanDto | null>(null);

  function handleSubmit(form: SpendingPlanFormData) {
    const done = (msg: string) => {
      toast.success(msg);
      setSheetOpen(false);
    };
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, items: form.items, period: form.period, issuingEntityId: form.issuingEntityId },
        { onSuccess: () => done(t('plans.toast.updated')), onError: () => toast.error(t('plans.toast.saveError')) },
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => done(t('plans.toast.created')),
        onError: (err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(status === 409 ? t('plans.toast.duplicate') : status === 403 ? t('plans.toast.forbidden') : t('plans.toast.saveError'));
        },
      });
    }
  }

  function handleSubmitPlan(p: SpendingPlanDto) {
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
        {canCreate && (
          <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {t('plans.form.create')}
          </Button>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
          </div>
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
                <th className="px-4 py-3 w-[180px]" />
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
                      {p.status === 'REJECTED' && p.reviewNote && (
                        <span className="block text-xs text-danger mt-1">↩ {p.reviewNote}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-border tabular-nums text-text-secondary">{p.period}</td>
                    <td className="px-4 py-3 border-b border-border"><SpendingPlanStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 border-b border-border text-right font-semibold tabular-nums text-text-primary">{formatVnd(p.totalAmount)}</td>
                    <td className="px-4 py-3 border-b border-border">
                      {editable && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-8" onClick={() => { setEditing(p); setSheetOpen(true); }}>
                            <Pencil className="size-3.5 mr-1" />{t('plans.actions.edit')}
                          </Button>
                          <Button size="sm" className="h-8" disabled={submitMutation.isPending} onClick={() => handleSubmitPlan(p)}>
                            <Send className="size-3.5 mr-1" />{t('plans.actions.submit')}
                          </Button>
                        </div>
                      )}
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
    </div>
  );
}
