import { useTranslation } from 'react-i18next';
import type { PaymentRequestStatus } from '@hrm/shared';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';

const STATUS_MAP: Record<PaymentRequestStatus, BadgeStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  CANCELLED: 'terminated',
  PAID: 'paid',
};

export function PaymentStatusBadge({ status }: { status: PaymentRequestStatus }) {
  const { t } = useTranslation('payment');
  return <StatusBadge status={STATUS_MAP[status]} label={t(`status.${status}`)} />;
}
