import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../shared/errors/AppError.js';
import { permissionService } from '../../domain/services/permission.service.js';

const SUPER_ADMIN = 'SUPER_ADMIN';

/**
 * Permission-based guard. Grants access only if the caller's resolved
 * permission set contains every required key. SUPER_ADMIN is implicit-all and
 * always bypasses, so role-matrix edits can never lock an admin out.
 */
export function requirePermission(...requiredKeys: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      throw new ForbiddenError('Access denied');
    }

    if (user.role === SUPER_ADMIN) {
      next();
      return;
    }

    if (!user.roleId) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }

    const granted = await permissionService.getPermissionsForRole(user.roleId);
    const hasAll = requiredKeys.every((key) => granted.has(key));

    if (!hasAll) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }

    next();
  };
}

/**
 * Permission-based guard that grants access if the caller holds ANY one of the
 * required keys (vs. requirePermission which needs all). Used where two distinct
 * roles legitimately reach the same read — e.g. payroll runs are visible to both
 * the maker (payroll:process) and the checker (payroll:approve). SUPER_ADMIN
 * bypasses as always.
 */
export function requireAnyPermission(...requiredKeys: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      throw new ForbiddenError('Access denied');
    }

    if (user.role === SUPER_ADMIN) {
      next();
      return;
    }

    if (!user.roleId) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }

    const granted = await permissionService.getPermissionsForRole(user.roleId);
    const hasAny = requiredKeys.some((key) => granted.has(key));

    if (!hasAny) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }

    next();
  };
}
