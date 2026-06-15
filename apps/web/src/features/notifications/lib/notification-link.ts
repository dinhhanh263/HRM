import type { NotificationDto } from '@hrm/shared';

/**
 * Maps a notification to the in-app route it should deep-link to when clicked,
 * or null when the notification has no actionable destination.
 */
export function notificationLink(item: Pick<NotificationDto, 'kind'>): string | null {
  switch (item.kind) {
    case 'probation_ending':
      return '/probation';
    case 'probation_self_requested':
      return '/probation/me';
    default:
      return null;
  }
}
