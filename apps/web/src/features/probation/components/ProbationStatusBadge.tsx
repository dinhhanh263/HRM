import { useTranslation } from 'react-i18next';
import type { ProbationReviewStatus } from '@hrm/shared';
import { StatusBadge, type BadgeStatus } from '@/components/ui/status-badge';

const STATUS_MAP: Record<ProbationReviewStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PENDING_HR: 'pending',
  DECIDED: 'approved',
  CANCELLED: 'terminated',
};

export function ProbationStatusBadge({ status }: { status: ProbationReviewStatus }) {
  const { t } = useTranslation('probation');
  return <StatusBadge status={STATUS_MAP[status]} label={t(`status.${status}`)} />;
}
