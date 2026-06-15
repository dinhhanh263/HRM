import { db } from '../../infrastructure/database/client.js';

// SPEC-037 — self-service reads/writes, always keyed by the caller's own ids.
export const accountRepository = {
  async findUser(userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        lastLoginAt: true,
        googleLinkedAt: true,
        notificationPrefs: true,
      },
    });
  },

  async findEmployeeProfile(userId: string, tenantId: string) {
    return db.employee.findFirst({
      where: { userId, tenantId },
      select: {
        id: true,
        employeeCode: true,
        joinDate: true,
        phone: true,
        avatar: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });
  },

  async updateEmployeeProfile(
    employeeId: string,
    data: { phone?: string; avatar?: string | null },
  ) {
    return db.employee.update({ where: { id: employeeId }, data });
  },

  async updateNotificationPrefs(userId: string, prefs: Record<string, boolean>) {
    await db.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
  },
};
