import type { AssetStatus } from '@hrm/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Semantic status colors follow the CLAUDE.md statusConfig pattern: Tailwind
// classes with explicit dark: variants so the badge keeps WCAG contrast in both
// modes. No inline hex — token discipline (ui-modern.md §6).
const statusConfig: Record<AssetStatus, { labelKey: string; class: string }> = {
  AVAILABLE: {
    labelKey: 'status.AVAILABLE',
    class:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  ASSIGNED: {
    labelKey: 'status.ASSIGNED',
    class:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  UNDER_MAINTENANCE: {
    labelKey: 'status.UNDER_MAINTENANCE',
    class:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  RETIRED: {
    labelKey: 'status.RETIRED',
    class:
      'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  },
  LOST: {
    labelKey: 'status.LOST',
    class:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  },
};

interface AssetStatusBadgeProps {
  status: AssetStatus;
}

export function AssetStatusBadge({ status }: AssetStatusBadgeProps) {
  const { t } = useTranslation('asset');
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full border text-xs font-medium',
        config.class,
      )}
    >
      {t(config.labelKey)}
    </span>
  );
}
