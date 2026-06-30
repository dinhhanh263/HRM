import { useTranslation } from 'react-i18next';
import type { CustomerLifecycle } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Status carries BOTH colour + label (a11y: never colour alone — see ui-modern.md).
const STYLES: Record<CustomerLifecycle, string> = {
  NEW: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  CONTACTED:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  QUALIFIED:
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  CONVERTED:
    'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  CUSTOMER:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  DISQUALIFIED:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
};

export function LifecycleBadge({ status }: { status: CustomerLifecycle }) {
  const { t } = useTranslation('sales');
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', STYLES[status])}>
      {t(`lifecycle.${status}`)}
    </Badge>
  );
}
