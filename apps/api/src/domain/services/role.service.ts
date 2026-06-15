import type { RoleDto, RoleListItemDto } from '@hrm/shared';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { roleRepository } from '../repositories/role.repository.js';
import { permissionService } from './permission.service.js';

// Derive a stable, tenant-unique `resource:action`-style key from a display name.
// Strips Vietnamese diacritics so keys stay ASCII snake_case.
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'role';
}

interface RoleListRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { permissions: number; users: number };
}

function toListItem(role: RoleListRow): RoleListItemDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionCount: role._count.permissions,
    userCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

interface RoleDetailRow {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { key: string } }[];
}

function toDto(role: RoleDetailRow): RoleDto {
  return {
    id: role.id,
    tenantId: role.tenantId,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp) => rp.permission.key),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export const roleService = {
  async getAll(tenantId: string): Promise<RoleListItemDto[]> {
    const roles = await roleRepository.findAll(tenantId);
    return roles.map(toListItem);
  },

  async getById(id: string, tenantId: string): Promise<RoleDto> {
    const role = await roleRepository.findById(id, tenantId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    return toDto(role);
  },

  async create(
    tenantId: string,
    data: { name: string; description?: string | null; permissions: string[] },
  ): Promise<RoleDto> {
    const name = data.name.trim();
    const existingName = await roleRepository.findByName(name, tenantId);
    if (existingName) {
      throw new ConflictError('Role name already exists');
    }

    const key = slugify(name);
    const existingKey = await roleRepository.findByKey(key, tenantId);
    if (existingKey) {
      throw new ConflictError('Role name already exists');
    }

    const permissionIds = await roleRepository.permissionIdsByKeys(data.permissions);
    const id = await roleRepository.createWithPermissions(
      { tenantId, key, name, description: data.description ?? null },
      permissionIds,
    );

    return this.getById(id, tenantId);
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; description?: string | null; permissions?: string[] },
  ): Promise<RoleDto> {
    const role = await roleRepository.findById(id, tenantId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    // System roles: their permission set is configurable, but the name and
    // description (which back the catalog + i18n labels) are locked, and they
    // can never be deleted.
    if (role.isSystem) {
      const renaming =
        (data.name !== undefined && data.name.trim() !== role.name) ||
        (data.description !== undefined && (data.description ?? null) !== (role.description ?? null));
      if (renaming) {
        throw new ConflictError('Cannot rename a system role');
      }
    }

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (name !== role.name) {
        const existing = await roleRepository.findByName(name, tenantId);
        if (existing) {
          throw new ConflictError('Role name already exists');
        }
      }
    }

    let permissionIds: string[] | undefined;
    if (data.permissions !== undefined) {
      permissionIds = await roleRepository.permissionIdsByKeys(data.permissions);
    }

    await roleRepository.updateWithPermissions(
      id,
      { name: data.name?.trim(), description: data.description },
      permissionIds,
    );

    // Matrix changed → drop the cached permission set so guards see it immediately.
    if (data.permissions !== undefined) {
      await permissionService.invalidateRolePermissions(id);
    }

    return this.getById(id, tenantId);
  },

  async delete(id: string, tenantId: string): Promise<void> {
    const role = await roleRepository.findById(id, tenantId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    if (role.isSystem) {
      throw new ConflictError('Cannot delete a system role');
    }

    const userCount = await roleRepository.countUsers(id);
    if (userCount > 0) {
      throw new ConflictError(`Cannot delete a role with ${userCount} assigned user(s)`);
    }

    await roleRepository.delete(id);
    await permissionService.invalidateRolePermissions(id);
  },
};
