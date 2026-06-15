import { db } from '../../infrastructure/database/client.js';

export const notificationRepository = {
  /**
   * Insert one notification. `dedupeKey` unique theo user — dùng key có ngữ nghĩa
   * (vd `probation_self_requested:<reviewId>`) để gọi lại không nhân đôi.
   */
  async create(data: {
    tenantId: string;
    userId: string;
    kind: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    dedupeKey: string;
  }) {
    return db.notification.upsert({
      where: { userId_dedupeKey: { userId: data.userId, dedupeKey: data.dedupeKey } },
      update: {},
      create: data,
    });
  },

  /** Caller-scoped page of notifications (newest first). */
  async findByUser(userId: string, tenantId: string, skip: number, take: number) {
    return db.notification.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  async countByUser(userId: string, tenantId: string) {
    return db.notification.count({ where: { userId, tenantId } });
  },

  async countUnread(userId: string, tenantId: string) {
    return db.notification.count({ where: { userId, tenantId, readAt: null } });
  },

  async findById(id: string, userId: string, tenantId: string) {
    return db.notification.findFirst({ where: { id, userId, tenantId } });
  },

  async markRead(id: string) {
    return db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: string, tenantId: string) {
    return db.notification.updateMany({
      where: { userId, tenantId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
