import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface SettingsAuditInsert {
  tenantId: string;
  userId: string;
  section: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export const settingsRepository = {
  /** Seats in use = ACTIVE users of the tenant (SPEC-036 plan section). */
  async countActiveUsers(tenantId: string): Promise<number> {
    return db.user.count({ where: { tenantId, status: 'ACTIVE' } });
  },

  async insertAudit(entry: SettingsAuditInsert): Promise<void> {
    await db.settingsAuditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        section: entry.section,
        changes: entry.changes as Prisma.InputJsonValue,
      },
    });
  },

  /** Newest-first audit entries with the author's name resolved. */
  async listAudit(tenantId: string, limit = 50) {
    return db.settingsAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        section: true,
        changes: true,
        createdAt: true,
        user: { select: { id: true, fullName: true } },
      },
    });
  },
};
