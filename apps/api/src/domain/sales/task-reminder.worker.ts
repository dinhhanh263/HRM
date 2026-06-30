import { db } from '../../infrastructure/database/client.js';
import { notificationRepository } from '../repositories/notification.repository.js';

export interface SalesTaskReminderJob {
  taskId: string;
}

/**
 * Fires at a SalesTask's dueAt. Creates an in-app notification for the assignee —
 * but only if the task is still OPEN (completed/cancelled tasks are skipped, so we
 * never need to cancel the queued job). dedupeKey keeps it idempotent on retry.
 */
export async function salesTaskReminderHandler(payload: unknown): Promise<void> {
  const { taskId } = payload as SalesTaskReminderJob;
  const task = await db.salesTask.findUnique({
    where: { id: taskId },
    include: {
      customer: { select: { fullName: true } },
      assignee: { select: { userId: true } },
    },
  });
  if (!task || task.status !== 'OPEN' || !task.assignee?.userId) return;

  await notificationRepository.create({
    tenantId: task.tenantId,
    userId: task.assignee.userId,
    kind: 'sales_task_due',
    title: 'Việc cần làm tới hạn',
    body: `${task.title} — ${task.customer?.fullName ?? ''}`.trim(),
    entityType: 'sales_task',
    entityId: task.id,
    dedupeKey: `sales_task_due:${task.id}`,
  });
}
