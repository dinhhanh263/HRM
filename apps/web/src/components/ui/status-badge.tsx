import { cn } from '@/lib/utils';

export type BadgeStatus =
  | 'active'
  | 'approved'
  | 'pending'
  | 'draft'
  | 'inactive'
  | 'rejected'
  | 'returned'
  | 'terminated'
  | 'on-leave'
  | 'expired';

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  className?: string;
}

const statusConfig: Record<
  BadgeStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  // Active / Approved - Green
  active: {
    label: 'Hoạt động',
    bg: '#DCFCE7',
    text: '#15803D',
    border: '#86EFAC',
  },
  approved: {
    label: 'Đã duyệt',
    bg: '#DCFCE7',
    text: '#15803D',
    border: '#86EFAC',
  },

  // Pending / Draft - Yellow/Orange
  pending: {
    label: 'Chờ duyệt',
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
  },
  draft: {
    label: 'Nháp',
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
  },

  // Inactive / Rejected - Red
  inactive: {
    label: 'Tạm nghỉ',
    bg: '#FEE2E2',
    text: '#B91C1C',
    border: '#FECACA',
  },
  rejected: {
    label: 'Từ chối',
    bg: '#FEE2E2',
    text: '#B91C1C',
    border: '#FECACA',
  },

  // Returned for edit - Info Blue (không phải từ chối; chờ NV sửa lại)
  returned: {
    label: 'Trả về sửa lại',
    bg: '#DBEAFE',
    text: '#1D4ED8',
    border: '#93C5FD',
  },

  // Terminated - Gray
  terminated: {
    label: 'Đã nghỉ việc',
    bg: '#F3F4F6',
    text: '#6B7280',
    border: '#D1D5DB',
  },

  // On Leave - Blue
  'on-leave': {
    label: 'Đang nghỉ phép',
    bg: '#DBEAFE',
    text: '#1D4ED8',
    border: '#93C5FD',
  },

  // Expired - Gray dark
  expired: {
    label: 'Hết hạn',
    bg: '#E5E7EB',
    text: '#4B5563',
    border: '#9CA3AF',
  },
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium',
        className
      )}
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {label || config.label}
    </span>
  );
}
