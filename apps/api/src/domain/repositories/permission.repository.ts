import { db } from '../../infrastructure/database/client.js';

export const permissionRepository = {
  async findKeysByRoleId(roleId: string): Promise<string[]> {
    const rows = await db.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
    });
    return rows.map((row) => row.permission.key);
  },

  async findAllKeys(): Promise<string[]> {
    const rows = await db.permission.findMany({ select: { key: true } });
    return rows.map((row) => row.key);
  },
};
