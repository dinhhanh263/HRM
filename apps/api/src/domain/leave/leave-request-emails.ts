import { leaveRequestRepository } from '../repositories/leave-request.repository.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { buildLeaveRequestsLink } from '../../shared/configs/email.config.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * SPEC-046: email the people who care about a newly (re)submitted leave request —
 * the current-step approver(s) and the flow's CC/watchers. Entirely best-effort:
 * every failure is caught and logged so email never breaks the leave flow.
 */
interface EmailLeaveRequestParams {
  tenantId: string;
  requestId: string;
  requesterName: string;
  /** Requester's User id, excluded from all recipient lists (no self-email). */
  requesterUserId: string | null;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  totalDays: number | string;
  reason?: string | null;
  flowId: string;
  /** Concrete targets of the current pending approval step. */
  approver: { employeeIds: string[]; roleKeys: string[] };
}

/** UTC dd/MM/yyyy — leave dates are stored at UTC midnight. */
function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export async function emailLeaveRequestParticipants(params: EmailLeaveRequestParams): Promise<void> {
  const {
    tenantId,
    requestId,
    requesterName,
    requesterUserId,
    leaveTypeName,
    startDate,
    endDate,
    totalDays,
    reason,
    flowId,
    approver,
  } = params;

  try {
    const [approverRecipients, watcherTargets] = await Promise.all([
      leaveRequestRepository.findUserRecipients(tenantId, approver.employeeIds, approver.roleKeys),
      leaveRequestRepository.findFlowWatcherTargets(flowId),
    ]);
    const watcherRecipients = await leaveRequestRepository.findUserRecipients(
      tenantId,
      watcherTargets.employeeIds,
      watcherTargets.roleKeys,
    );

    const base = {
      requesterName,
      leaveTypeName,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      totalDays: String(totalDays),
      reason: reason ?? null,
      link: buildLeaveRequestsLink(),
    };

    // A person who is both approver and watcher gets a single (approver) email.
    const sent = new Set<string>();
    if (requesterUserId) sent.add(requesterUserId);

    const send = (
      recipient: { userId: string; email: string; fullName: string },
      audience: 'approver' | 'watcher',
    ) =>
      emailProvider
        .sendLeaveRequestNotification({
          to: recipient.email,
          recipientName: recipient.fullName,
          audience,
          ...base,
        })
        .catch((err) =>
          logger.error(
            { err, event: 'email.leave_request.failed', to: recipient.email, audience, requestId },
            'Failed to send leave request email',
          ),
        );

    const jobs: Promise<unknown>[] = [];
    for (const r of approverRecipients) {
      if (sent.has(r.userId)) continue;
      sent.add(r.userId);
      jobs.push(send(r, 'approver'));
    }
    for (const r of watcherRecipients) {
      if (sent.has(r.userId)) continue;
      sent.add(r.userId);
      jobs.push(send(r, 'watcher'));
    }

    await Promise.all(jobs);
  } catch (error) {
    logger.error(
      { err: error, event: 'email.leave_request.failed', requestId },
      'Failed to email leave request participants',
    );
  }
}
