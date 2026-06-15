import { useTranslation } from 'react-i18next';
import type { AssetMaintenanceDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { formatVnd } from '@/lib/utils';
import { Wrench } from 'lucide-react';

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface AssetMaintenanceHistoryProps {
  maintenances: AssetMaintenanceDto[];
}

export function AssetMaintenanceHistory({ maintenances }: AssetMaintenanceHistoryProps) {
  const { t, i18n } = useTranslation('asset');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  if (maintenances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Wrench className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">
          {t('asset.maintenance.emptyTitle')}
        </p>
        <p className="text-text-muted text-sm mt-2">{t('asset.maintenance.emptyDescription')}</p>
      </div>
    );
  }

  const totalCost = maintenances.reduce((sum, m) => sum + (m.cost ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Total cost summary */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-4 py-3">
        <span className="text-sm text-text-secondary">{t('asset.maintenance.totalCost')}</span>
        <span className="text-base font-semibold text-text-primary tabular-nums">
          {formatVnd(totalCost)}
        </span>
      </div>

      <ol className="relative space-y-4">
        {maintenances.map((m) => {
          const isOpen = !m.completedAt;
          return (
            <li
              key={m.id}
              className="flex items-start gap-4 rounded-lg border border-border bg-surface p-4"
            >
              <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                <Wrench className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-text-primary m-0">{m.description}</p>
                  <Badge
                    variant="outline"
                    className={
                      isOpen
                        ? 'text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                        : 'text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                    }
                  >
                    {t(`asset.maintenance.recordStatus.${isOpen ? 'OPEN' : 'COMPLETED'}`)}
                  </Badge>
                </div>

                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <dt className="text-text-muted">{t('asset.maintenance.startedAt')}</dt>
                    <dd className="text-text-secondary m-0">{formatDate(m.startedAt, locale)}</dd>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <dt className="text-text-muted">{t('asset.maintenance.completedAt')}</dt>
                    <dd className="text-text-secondary m-0">{formatDate(m.completedAt, locale)}</dd>
                  </div>
                  {m.vendor && (
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                      <dt className="text-text-muted">{t('asset.maintenance.vendor')}</dt>
                      <dd className="text-text-secondary m-0">{m.vendor}</dd>
                    </div>
                  )}
                  {m.cost != null && (
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                      <dt className="text-text-muted">{t('asset.maintenance.cost')}</dt>
                      <dd className="text-text-secondary m-0 tabular-nums">{formatVnd(m.cost)}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <dt className="text-text-muted">{t('asset.maintenance.createdBy')}</dt>
                    <dd className="text-text-secondary m-0">{m.createdBy?.fullName ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
