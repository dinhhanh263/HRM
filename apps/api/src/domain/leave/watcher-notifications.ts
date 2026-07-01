import { leaveRequestRepository } from '../repositories/leave-request.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * SPEC-046: in-app notifications for leave-request CC/watchers. A watcher is
 * notified when a request they follow is submitted, and again when it reaches a
 * final decision. Best-effort: a notification failure must never break the leave
 * flow, so every path is wrapped and logged.
 */
export type WatcherNotifyEvent = 'submitted' | 'decided';

interface NotifyLeaveWatchersParams {
  tenantId: string;
  requestId: string;
  flowId: string;
  /** Requester's display name, woven into the notification body. */
  employeeName: string;
  /** For 'decided': the terminal status reached (e.g. APPROVED). */
  status?: string;
  /** User ids to skip (owner, the deciding actor) so people are not self-notified. */
  excludeUserIds?: string[];
}

const COPY: Record<
  WatcherNotifyEvent,
  { kind: string; title: string; body: (name: string, status?: string) => string }
> = {
  submitted: {
    kind: 'leave_watch_submitted',
    title: 'Đơn nghỉ phép mới cần theo dõi',
    body: (name) => `${name} vừa nộp một đơn nghỉ phép mà bạn được CC để theo dõi.`,
  },
  decided: {
    kind: 'leave_watch_decided',
    title: 'Đơn nghỉ phép đã có kết quả',
    body: (name, status) =>
      status === 'APPROVED'
        ? `Đơn nghỉ phép của ${name} đã được duyệt.`
        : `Đơn nghỉ phép của ${name} đã có kết quả cuối cùng.`,
  },
};

export async function notifyLeaveWatchers(
  event: WatcherNotifyEvent,
  params: NotifyLeaveWatchersParams,
): Promise<void> {
  const { tenantId, requestId, flowId, employeeName, status, excludeUserIds = [] } = params;
  try {
    const recipients = await leaveRequestRepository.findWatcherRecipientUserIds(tenantId, flowId);
    const exclude = new Set(excludeUserIds);
    const targets = recipients.filter((userId) => !exclude.has(userId));
    if (targets.length === 0) return;

    const copy = COPY[event];
    await Promise.all(
      targets.map((userId) =>
        notificationRepository.create({
          tenantId,
          userId,
          kind: copy.kind,
          title: copy.title,
          body: copy.body(employeeName, status),
          entityType: 'leave_request',
          entityId: requestId,
          // Per-request-per-event; upsert also keys on userId → one row per watcher.
          dedupeKey: `${copy.kind}:${requestId}`,
        }),
      ),
    );
  } catch (error) {
    logger.error(
      { err: error, event: `leave.watch_notify_failed`, notifyEvent: event, requestId },
      'Failed to notify leave-request watchers',
    );
  }
}
