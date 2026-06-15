import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AssetStatusBadge } from './AssetStatusBadge';
import { AcknowledgeHandoverDialog } from './AcknowledgeHandoverDialog';
import { SignaturePreviewDialog } from './SignaturePreviewDialog';
import { useMyAssets, useAcknowledgeHandover } from '../hooks/useAssets';
import { Package, Tag, MapPin, AlertTriangle, PenLine, CheckCircle2, Eye } from 'lucide-react';

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function MyAssetsView() {
  const { t, i18n } = useTranslation('asset');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const { data: assets, isLoading, error } = useMyAssets();
  const acknowledge = useAcknowledgeHandover();
  // assignmentId của phiếu đang ký (mở dialog); null = đóng.
  const [signingId, setSigningId] = useState<string | null>(null);
  // assignmentId của phiếu đang xem chữ ký; null = đóng.
  const [viewingSignatureId, setViewingSignatureId] = useState<string | null>(null);

  function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleSign(signature: string) {
    if (!signingId) return;
    acknowledge.mutate(
      { assignmentId: signingId, signature },
      {
        onSuccess: () => {
          toast.success(t('asset.handover.toast.ackSuccess'));
          setSigningId(null);
        },
        onError: () => {
          toast.error(t('asset.handover.toast.ackError'), {
            description: t('asset.handover.toast.ackErrorHint'),
          });
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('asset.mine.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('asset.mine.subtitle')}</p>
        </div>
        {assets && assets.length > 0 && (
          <p className="text-xs text-text-muted shrink-0">
            <span className="font-medium text-text-primary">{assets.length}</span>{' '}
            {t('asset.mine.countSuffix')}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              </div>
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <p className="text-text-primary font-medium">{t('asset.mine.loadError')}</p>
        </div>
      ) : !assets || assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <Package className="size-6 text-text-muted" />
          </div>
          <p className="text-text-primary font-medium text-base m-0">
            {t('asset.mine.emptyTitle')}
          </p>
          <p className="text-text-muted text-sm mt-2 max-w-xs">
            {t('asset.mine.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-primary truncate m-0">{asset.name}</p>
                  <code className="text-text-muted font-mono text-xs">{asset.assetCode}</code>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Tag className="size-4 text-text-muted shrink-0" />
                  <span className="truncate">{asset.category?.name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-text-muted shrink-0" />
                  <span className={asset.location ? 'text-text-secondary' : 'text-text-muted'}>
                    {asset.location || '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                <div className="min-w-0">
                  <span className="text-xs text-text-muted">{t('asset.mine.assignedAt')}: </span>
                  <span className="text-xs font-medium text-text-secondary">
                    {formatDate(asset.currentAssignment?.assignedAt, locale)}
                  </span>
                </div>
                <AssetStatusBadge status={asset.status} />
              </div>

              {asset.currentAssignment?.ackStatus === 'PENDING' && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <PenLine className="size-4 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary m-0">
                        {t('asset.handover.pendingCardTitle')}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {t('asset.handover.pendingCardDescription')}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => setSigningId(asset.currentAssignment!.id)}
                  >
                    <PenLine size={14} />
                    {t('asset.handover.signNow')}
                  </Button>
                </div>
              )}

              {asset.currentAssignment?.ackStatus === 'SIGNED' && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2 dark:border-green-800 dark:bg-green-950">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-green-600 shrink-0 mt-0.5 dark:text-green-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-700 m-0 dark:text-green-300">
                        {t('asset.handover.status.SIGNED')}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {t('asset.handover.signedAt', {
                          date: formatDateTime(asset.currentAssignment.acknowledgedAt),
                        })}
                      </p>
                    </div>
                  </div>
                  {asset.currentAssignment.hasSignature && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => setViewingSignatureId(asset.currentAssignment!.id)}
                    >
                      <Eye size={14} />
                      {t('asset.handover.viewSignature')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AcknowledgeHandoverDialog
        open={signingId !== null}
        onOpenChange={(open) => !open && setSigningId(null)}
        onSubmit={handleSign}
        isLoading={acknowledge.isPending}
      />

      <SignaturePreviewDialog
        assignmentId={viewingSignatureId}
        open={viewingSignatureId !== null}
        onOpenChange={(open) => !open && setViewingSignatureId(null)}
      />
    </div>
  );
}
