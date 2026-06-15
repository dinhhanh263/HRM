import { db } from '../../infrastructure/database/client.js';

export const refreshTokenRepository = {
  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    persistent: boolean;
    userAgent?: string | null;
    lastUsedAt?: Date | null;
  }) {
    return db.refreshToken.create({ data });
  },

  async findByTokenHash(tokenHash: string) {
    return db.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  },

  async revoke(id: string) {
    return db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllForUser(userId: string) {
    return db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  // SPEC-037: revoke every other session after a password change (or the
  // explicit "sign out other devices" action), keeping the current one.
  async revokeOthersForUser(userId: string, keepTokenHash: string | null) {
    return db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  },

  /** Active sessions of a user, newest first (SPEC-037 account screen). */
  async listActiveForUser(userId: string) {
    return db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        userAgent: true,
        persistent: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  },
};
