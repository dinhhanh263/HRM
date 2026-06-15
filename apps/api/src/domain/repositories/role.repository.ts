import { db } from '../../infrastructure/database/client.js';

export const roleRepository = {
  async findAll(tenantId: string) {
    return db.role.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { permissions: true, users: true } } },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.role.findFirst({
      where: { id, tenantId },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
  },

  async findByKey(key: string, tenantId: string) {
    return db.role.findFirst({ where: { tenantId, key } });
  },

  async findByName(name: string, tenantId: string) {
    return db.role.findFirst({ where: { tenantId, name } });
  },

  async permissionIdsByKeys(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await db.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  async createWithPermissions(
    data: { tenantId: string; key: string; name: string; description: string | null },
    permissionIds: string[],
  ) {
    return db.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { ...data, isSystem: false } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
      return role.id;
    });
  },

  async updateWithPermissions(
    id: string,
    data: { name?: string; description?: string | null },
    permissionIds?: string[],
  ) {
    return db.$transaction(async (tx) => {
      if (data.name !== undefined || data.description !== undefined) {
        await tx.role.update({ where: { id }, data });
      }
      // permissionIds === undefined means "leave the matrix untouched".
      if (permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
            skipDuplicates: true,
          });
        }
      }
    });
  },

  async delete(id: string) {
    return db.role.delete({ where: { id } });
  },

  async countUsers(id: string): Promise<number> {
    return db.user.count({ where: { roleId: id } });
  },
};
