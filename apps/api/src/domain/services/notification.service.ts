import type { Notification } from '@prisma/client';
import type { NotificationDto, NotificationListDto } from '@hrm/shared';
import { notificationRepository } from '../repositories/notification.repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export interface NotificationListParams {
  page: number;
  limit: number;
}

export const notificationService = {
  async list(
    userId: string,
    tenantId: string,
    { page, limit }: NotificationListParams,
  ): Promise<NotificationListDto> {
    const skip = (page - 1) * limit;
    const [rows, total, unreadCount] = await Promise.all([
      notificationRepository.findByUser(userId, tenantId, skip, limit),
      notificationRepository.countByUser(userId, tenantId),
      notificationRepository.countUnread(userId, tenantId),
    ]);

    return {
      data: rows.map(toNotificationDto),
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async markRead(id: string, userId: string, tenantId: string): Promise<NotificationDto> {
    // Caller-scoped: a notification owned by another user is invisible (404).
    const existing = await notificationRepository.findById(id, userId, tenantId);
    if (!existing) {
      throw new NotFoundError('Notification not found');
    }

    const updated = await notificationRepository.markRead(id);
    return toNotificationDto(updated);
  },

  async markAllRead(userId: string, tenantId: string): Promise<{ updated: number }> {
    const result = await notificationRepository.markAllRead(userId, tenantId);
    return { updated: result.count };
  },
};
