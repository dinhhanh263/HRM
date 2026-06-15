import { useTranslation } from 'react-i18next';
import type { PayrollRunStatus } from '@hrm/shared';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';

const STATUS_MAP: Record<PayrollRunStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'approved',
  PAID: 'active',
  CANCELLED: 'terminated',
};

export function PayrollRunStatusBadge({ status }: { status: PayrollRunStatus }) {
  const { t } = useTranslation('payroll');
  return <StatusBadge status={STATUS_MAP[status]} label={t(`runs.status.${status}`)} />;
}
