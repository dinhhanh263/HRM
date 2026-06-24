import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreatePaymentRequestRequest,
  PaymentRequestDto,
  PaymentRequestStatus,
  PaymentRequestType,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { usePermission } from '@/hooks/usePermission';
import { getApiErrorCode } from '@/lib/api-error';
import { formatVnd, cn } from '@/lib/utils';
import { Plus, AlertTriangle, Receipt, Search, Download, Loader2 } from 'lucide-react';
import { PaymentRequestTable } from '../components/PaymentRequestTable';
import { PaymentRequestForm } from '../components/PaymentRequestForm';
import { PaymentRequestDetailSheet } from '../components/PaymentRequestDetailSheet';
import { PaymentStatsPanel } from '../components/PaymentStatsPanel';
import {
  usePaymentRequests,
  useCreatePaymentRequest,
  useResubmitPaymentRequest,
  exportPaymentRequests,
} from '../hooks/usePaymentRequests';

type Tab = 'mine' | 'review' | 'all' | 'stats';

const STATUSES: PaymentRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'PAID'];
const TYPES: PaymentRequestType[] = ['REIMBURSEMENT', 'ADVANCE', 'VENDOR_PAYMENT'];

export function PaymentRequestPage() {
  const { t } = useTranslation('payment');
  const { can } = usePermission();
  const canReview = can('payment_request:approve') || can('payment_request:reject');

  const [tab, setTab] = useState<Tab>(canReview ? 'review' : 'mine');
  const [statusFilter, setStatusFilter] = useState<PaymentRequestStatus | undefined>();
  const [typeFilter, setTypeFilter] = useState<PaymentRequestType | undefined>();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<PaymentRequestDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const createMutation = useCreatePaymentRequest();
  const resubmitMutation = useResubmitPaymentRequest();

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'mine', label: t('tabs.mine'), show: true },
    { key: 'review', label: t('tabs.review'), show: canReview },
    { key: 'all', label: t('tabs.all'), show: canReview },
    { key: 'stats', label: t('tabs.stats'), show: canReview },
  ];

  const isStats = tab === 'stats';
  const { data, isLoading, isError } = usePaymentRequests(
    {
      scope: isStats ? 'all' : tab,
      status: statusFilter,
      type: typeFilter,
      search: search.trim() || undefined,
    },
    { enabled: !isStats },
  );

  function openCreate() {
    setResubmitTarget(null);
    setFormOpen(true);
  }

  async function handleExport() {
    if (isStats) return;
    setExporting(true);
    try {
      await exportPaymentRequests({
        scope: tab,
        status: statusFilter,
        type: typeFilter,
        search: search.trim() || undefined,
      });
      toast.success(t('toast.exported'));
    } catch {
      toast.error(t('toast.tryAgain'));
    } finally {
      setExporting(false);
    }
  }

  function openResubmit(request: PaymentRequestDto) {
    setDetailId(null);
    setResubmitTarget(request);
    setFormOpen(true);
  }

  function handleSubmit(payload: CreatePaymentRequestRequest) {
    const onErr = (error: unknown) => {
      const code = getApiErrorCode(error);
      toast.error((code && t(`toast.errors.${code}`, { defaultValue: '' })) || t('toast.tryAgain'));
    };
    if (resubmitTarget) {
      resubmitMutation.mutate(
        { id: resubmitTarget.id, data: payload },
        {
          onSuccess: () => { toast.success(t('toast.resubmitted')); setFormOpen(false); setResubmitTarget(null); },
          onError: onErr,
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          toast.success(t('toast.created'));
          setFormOpen(false);
          // Open the new request so the user can attach invoices/bills right away.
          setDetailId(created.id);
        },
        onError: onErr,
      });
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{t('title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
        </div>
        <Can permission="payment_request:create">
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t('newRequest')}
          </Button>
        </Can>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.filter((tb) => tb.show).map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === tb.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {isStats ? (
        <PaymentStatsPanel />
      ) : (
        <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
          <Input
            className="pl-8 h-9 w-64 text-sm"
            placeholder={t('filters.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter ?? 'all'}
          onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : (v as PaymentRequestStatus))}
        >
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder={t('filters.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter ?? 'all'}
          onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : (v as PaymentRequestType))}
        >
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder={t('filters.type')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{t(`type.${ty}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          {data && items.length > 0 && (
            <span className="text-sm text-text-secondary">
              {t('table.totalAmount')}:{' '}
              <span className="font-semibold tabular-nums text-text-primary">{formatVnd(data.totalAmount)} ₫</span>
            </span>
          )}
          <Can permission="payment_request:export">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || items.length === 0}>
              {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
              {t('actions.export')}
            </Button>
          </Can>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="size-8 text-danger mb-2" />
          <p className="text-sm text-text-secondary">{t('table.loadError')}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Receipt className="size-6 text-text-muted" />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('table.empty')}</h3>
          <p className="text-sm text-text-muted max-w-xs mb-4">{t('table.emptyHint')}</p>
          <Can permission="payment_request:create">
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />{t('newRequest')}
            </Button>
          </Can>
        </div>
      ) : (
        <PaymentRequestTable items={items} showEmployee={tab !== 'mine'} onRowClick={setDetailId} />
      )}
        </>
      )}

      {/* Form (create / resubmit) */}
      <PaymentRequestForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setResubmitTarget(null); }}
        initialRequest={resubmitTarget}
        isSubmitting={createMutation.isPending || resubmitMutation.isPending}
        onSubmit={handleSubmit}
      />

      {/* Detail */}
      <PaymentRequestDetailSheet
        requestId={detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onEdit={openResubmit}
      />
    </div>
  );
}
