import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FundAccountDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { formatVnd } from '@/lib/utils';
import { Plus, AlertTriangle, Wallet } from 'lucide-react';
import { FundAccountTable } from '../components/FundAccountTable';
import { FundAccountFormSheet, type FundAccountFormData } from '../components/FundAccountFormSheet';
import {
  useFundAccounts,
  useIssuingEntitiesLite,
  useCreateFundAccount,
  useUpdateFundAccount,
  useSetFundAccountActive,
  useDeleteFundAccount,
} from '../hooks/useFundAccounts';

const ALL = '__all__';

export function FundAccountsPage() {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const [entityFilter, setEntityFilter] = useState<string>(ALL);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<FundAccountDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FundAccountDto | null>(null);

  const { data, isLoading, error } = useFundAccounts(
    entityFilter === ALL ? {} : { issuingEntityId: entityFilter },
  );
  const { data: entities = [] } = useIssuingEntitiesLite();
  const createMutation = useCreateFundAccount();
  const updateMutation = useUpdateFundAccount(editing?.id ?? '');
  const toggleMutation = useSetFundAccountActive();
  const deleteMutation = useDeleteFundAccount();

  const totalBalance = useMemo(
    () => (data ?? []).reduce((sum, a) => sum + Number(a.currentBalance), 0),
    [data],
  );

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function handleSubmit(formData: FundAccountFormData) {
    if (editing) {
      updateMutation.mutate(
        { name: formData.name, type: formData.type, openingBalance: formData.openingBalance },
        {
          onSuccess: () => {
            toast.success(t('accounts.toast.updated'));
            setSheetOpen(false);
          },
          onError: () => toast.error(t('accounts.toast.saveError')),
        },
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: () => {
          toast.success(t('accounts.toast.created'));
          setSheetOpen(false);
        },
        onError: () => toast.error(t('accounts.toast.saveError')),
      });
    }
  }

  function handleToggleActive(a: FundAccountDto) {
    toggleMutation.mutate(
      { id: a.id, active: !a.active },
      {
        onSuccess: () =>
          toast.success(a.active ? t('accounts.toast.deactivated') : t('accounts.toast.activated')),
        onError: () => toast.error(t('accounts.toast.saveError')),
      },
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('accounts.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.error(t('accounts.toast.hasTransactions'));
        } else {
          toast.error(t('accounts.toast.deleteError'));
        }
        setDeleteTarget(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('accounts.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('accounts.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          {t('accounts.form.create')}
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background flex-wrap">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('accounts.allEntities')}</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {data && (
            <p className="text-xs text-text-muted shrink-0">
              {t('accounts.totalBalance')}:{' '}
              <span className="font-semibold text-text-primary tabular-nums">{formatVnd(totalBalance)}</span>
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-3.5 w-1/3 rounded" />
                  <Skeleton className="h-3 w-1/4 rounded" />
                </div>
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
              <AlertTriangle className="size-5 text-danger" />
            </div>
            <p className="text-text-primary font-medium">{tc('states.error')}</p>
          </div>
        ) : (
          <FundAccountTable
            accounts={data ?? []}
            onCreate={openCreate}
            onEdit={(a) => {
              setEditing(a);
              setSheetOpen(true);
            }}
            onToggleActive={handleToggleActive}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      <FundAccountFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        account={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span className="inline-flex items-center gap-2">
                <Wallet className="size-4 text-danger" />
                {t('accounts.delete.title')}
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('accounts.delete.description', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleteMutation.isPending ? tc('states.deleting') : tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
