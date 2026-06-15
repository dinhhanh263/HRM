import { useTranslation } from 'react-i18next';
import type { JobStatus } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_CLASS: Record<JobStatus, string> = {
  DRAFT:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  OPEN: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  ON_HOLD:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  CLOSED:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  CANCELLED:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation('recruitment');
  return (
    <Badge variant="outline" className={`text-xs font-medium ${STATUS_CLASS[status]}`}>
      {t(`job.status.${status}`)}
    </Badge>
  );
}
