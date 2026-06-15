import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import type { AssetAssignmentDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Eye, FileDown, History, Loader2 } from 'lucide-react';
import { useDownloadHandoverPdf } from '../hooks/useAssets';
import { SignaturePreviewDialog } from './SignaturePreviewDialog';

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AssetAssignmentHistoryProps {
  assignments: AssetAssignmentDto[];
  assetCode: string;
}

export function AssetAssignmentHistory({ assignments, assetCode }: AssetAssignmentHistoryProps) {
  const { t, i18n } = useTranslation('asset');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const downloadPdf = useDownloadHandoverPdf();
  const [signatureAssignmentId, setSignatureAssignmentId] = useState<string | null>(null);

  const handleDownload = (assignmentId: string) => {
    downloadPdf.mutate(
      { assignmentId, assetCode },
      { onError: () => toast.error(t('asset.handover.toast.pdfError')) },
    );
  };

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">
          {t('asset.history.emptyTitle')}
        </p>
        <p className="text-text-muted text-sm mt-2">{t('asset.history.emptyDescription')}</p>
      </div>
    );
  }

  return (
    <>
      <ol className="relative space-y-4">
      {assignments.map((a) => {
        const isActive = a.status === 'ACTIVE';
        const isSigned = a.ackStatus === 'SIGNED';
        return (
          <li
            key={a.id}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-4"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-text-primary m-0">
                  {a.employee?.fullName ?? '—'}
                  {a.employee?.employeeCode && (
                    <span className="text-text-muted font-normal"> · {a.employee.employeeCode}</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      isSigned
                        ? 'text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                        : 'text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                    }
                  >
                    {t(`asset.handover.status.${a.ackStatus}`)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      isActive
                        ? 'text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                        : 'text-xs bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700'
                    }
                  >
                    {t(`asset.history.assignmentStatus.${a.status}`)}
                  </Badge>
                </div>
              </div>

              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                  <dt className="text-text-muted">{t('asset.history.assignedAt')}</dt>
                  <dd className="text-text-secondary m-0">{formatDate(a.assignedAt, locale)}</dd>
                </div>
                <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                  <dt className="text-text-muted">{t('asset.history.assignedBy')}</dt>
                  <dd className="text-text-secondary m-0">{a.assignedBy?.fullName ?? '—'}</dd>
                </div>
                {a.conditionOut && (
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <dt className="text-text-muted">{t('asset.history.conditionOut')}</dt>
                    <dd className="text-text-secondary m-0">{t(`condition.${a.conditionOut}`)}</dd>
                  </div>
                )}
                {!isActive && (
                  <>
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                      <dt className="text-text-muted">{t('asset.history.returnedAt')}</dt>
                      <dd className="text-text-secondary m-0">{formatDate(a.returnedAt, locale)}</dd>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                      <dt className="text-text-muted">{t('asset.history.returnedBy')}</dt>
                      <dd className="text-text-secondary m-0">{a.returnedBy?.fullName ?? '—'}</dd>
                    </div>
                    {a.conditionIn && (
                      <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                        <dt className="text-text-muted">{t('asset.history.conditionIn')}</dt>
                        <dd className="text-text-secondary m-0">{t(`condition.${a.conditionIn}`)}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>

              {a.note && (
                <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap m-0">{a.note}</p>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap border-t border-border pt-3">
                <p className="text-xs text-text-muted m-0">
                  {isSigned && a.ackMethod
                    ? `${t(`asset.handover.method.${a.ackMethod}`)} · ${t('asset.handover.signedAt', {
                        date: formatDateTime(a.acknowledgedAt, locale),
                      })}`
                    : t('asset.handover.status.PENDING')}
                </p>
                <div className="flex items-center gap-2">
                  {isSigned && a.hasSignature && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setSignatureAssignmentId(a.id)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t('asset.handover.viewSignature')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={downloadPdf.isPending}
                    onClick={() => handleDownload(a.id)}
                  >
                    {downloadPdf.isPending && downloadPdf.variables?.assignmentId === a.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5" />
                    )}
                    {t('asset.handover.downloadPdf')}
                  </Button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
      </ol>
      <SignaturePreviewDialog
        assignmentId={signatureAssignmentId}
        open={signatureAssignmentId !== null}
        onOpenChange={(open) => {
          if (!open) setSignatureAssignmentId(null);
        }}
      />
    </>
  );
}
