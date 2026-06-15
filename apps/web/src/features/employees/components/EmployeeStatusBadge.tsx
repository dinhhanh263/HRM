import type { EmployeeStatus } from '@hrm/shared';
import { useTranslation } from 'react-i18next';

const statusConfig: Record<
  EmployeeStatus,
  { labelKey: string; bg: string; text: string; border: string }
> = {
  // Active - Green (Active/Approved)
  ACTIVE: {
    labelKey: 'status.active',
    bg: '#DCFCE7',
    text: '#15803D',
    border: '#86EFAC',
  },
  // Inactive - Red (Inactive/Rejected)
  INACTIVE: {
    labelKey: 'status.inactive',
    bg: '#FEE2E2',
    text: '#B91C1C',
    border: '#FECACA',
  },
  // Terminated - Gray
  TERMINATED: {
    labelKey: 'status.terminated',
    bg: '#F3F4F6',
    text: '#6B7280',
    border: '#D1D5DB',
  },
};

interface EmployeeStatusBadgeProps {
  status: EmployeeStatus;
}

export function EmployeeStatusBadge({ status }: EmployeeStatusBadgeProps) {
  const { t } = useTranslation('employee');
  const config = statusConfig[status];

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {t(config.labelKey)}
    </span>
  );
}
