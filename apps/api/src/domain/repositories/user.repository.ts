import type { Prisma } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export const userRepository = {
  async findByEmailAndTenant(email: string, tenantId: string) {
    return db.user.findUnique({
      where: {
        tenantId_email: { tenantId, email },
      },
    });
  },

  async findById(id: string) {
    return db.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  },

  async create(data: Prisma.UserCreateInput) {
    return db.user.create({ data });
  },

  async updateLastLogin(id: string) {
    return db.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  },

  /** Store the hashed invite token + expiry on a user (set-password flow). */
  async setInvite(id: string, tokenHash: string, expiresAt: Date) {
    return db.user.update({
      where: { id },
      data: { inviteToken: tokenHash, inviteTokenExpiresAt: expiresAt },
    });
  },

  /** Look up a user by the sha256 hash of their invite token. */
  async findByInviteTokenHash(tokenHash: string) {
    return db.user.findFirst({ where: { inviteToken: tokenHash } });
  },

  /** SPEC-037: first successful Google sign-in — display-only "linked" state. */
  async markGoogleLinked(id: string) {
    return db.user.update({ where: { id }, data: { googleLinkedAt: new Date() } });
  },

  /** SPEC-037: rotate the password hash of an already-active account. */
  async updatePassword(id: string, passwordHash: string) {
    return db.user.update({
      where: { id },
      data: { passwordHash, passwordSetAt: new Date() },
    });
  },

  /**
   * Activate an invited user: set the bcrypt password hash, flip status to
   * ACTIVE, record passwordSetAt, and clear the (single-use) invite token.
   */
  async activateWithPassword(id: string, passwordHash: string) {
    return db.user.update({
      where: { id },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
        passwordSetAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
  },
};
