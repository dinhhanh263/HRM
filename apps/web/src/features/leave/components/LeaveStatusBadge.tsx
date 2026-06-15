import { useTranslation } from 'react-i18next';
import type { LeaveStatus } from '@hrm/shared';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';

const STATUS_MAP: Record<LeaveStatus, BadgeStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'terminated',
  RETURNED: 'returned',
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation('leave');
  return <StatusBadge status={STATUS_MAP[status]} label={t(`status.${status}`)} />;
}
