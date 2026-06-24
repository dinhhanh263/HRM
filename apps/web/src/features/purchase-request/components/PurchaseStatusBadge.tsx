import { useTranslation } from 'react-i18next';
import type { PurchaseRequestStatus } from '@hrm/shared';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';

const STATUS_MAP: Record<PurchaseRequestStatus, BadgeStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  CANCELLED: 'terminated',
  ORDERED: 'paid', // teal "success"-style, distinct from approved green
};

export function PurchaseStatusBadge({ status }: { status: PurchaseRequestStatus }) {
  const { t } = useTranslation('purchase');
  return <StatusBadge status={STATUS_MAP[status]} label={t(`status.${status}`)} />;
}
