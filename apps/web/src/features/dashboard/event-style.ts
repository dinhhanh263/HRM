import { Gift, Award, Briefcase, UserCheck, FileClock } from 'lucide-react';
import type { DashboardEventKind } from '@hrm/shared';

// Each event kind maps to a Lucide icon, a theme-token tint, and an i18n key
// (namespace `dashboard`, `events.*`). Shared by the dashboard widget and the
// event calendar (SPEC-035) so both render kinds identically.
export const EVENT_STYLE: Record<
  DashboardEventKind,
  { icon: React.ElementType; wrap: string; titleKey: string }
> = {
  birthday: { icon: Gift, wrap: 'bg-info/10 text-info', titleKey: 'birthday' },
  anniversary: { icon: Award, wrap: 'bg-warning/10 text-warning', titleKey: 'anniversary' },
  new_joiner: { icon: Briefcase, wrap: 'bg-success/10 text-success', titleKey: 'onboarding' },
  probation_ending: {
    icon: UserCheck,
    wrap: 'bg-warning/10 text-warning',
    titleKey: 'probationEnding',
  },
  contract_expiring: {
    icon: FileClock,
    wrap: 'bg-danger/10 text-danger',
    titleKey: 'contractExpiring',
  },
};

// Events carry a day-granular `YYYY-MM-DD`; format as DD/MM without timezone drift.
export function formatEventDate(isoDate: string) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}
