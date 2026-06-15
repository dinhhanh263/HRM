import type { Request, Response } from 'express';
import { PERMISSION_CATALOG, type PermissionCatalogGroup } from '@hrm/shared';

// The permission catalog is static (single source of truth in @hrm/shared), so
// we serve it grouped by resource straight from the constant — no DB round-trip.
const CATALOG: PermissionCatalogGroup[] = Object.entries(PERMISSION_CATALOG).map(
  ([resource, actions]) => ({
    resource,
    actions: actions.map((action) => ({ key: `${resource}:${action}`, action })),
  }),
);

export const permissionController = {
  async getCatalog(_req: Request, res: Response) {
    res.json({ success: true, data: CATALOG });
  },
};
