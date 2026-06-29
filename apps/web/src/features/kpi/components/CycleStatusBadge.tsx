import { useTranslation } from 'react-i18next';
import type { KpiCycleStatus } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CLASS: Record<KpiCycleStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  DATA_ENTRY: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  SELF_ASSESSMENT: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  FINALIZED: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  CLOSED: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
};

export function CycleStatusBadge({ status }: { status: KpiCycleStatus }) {
  const { t } = useTranslation('kpi');
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', CLASS[status])}>
      {t(`cycle.status.${status}`)}
    </Badge>
  );
}
