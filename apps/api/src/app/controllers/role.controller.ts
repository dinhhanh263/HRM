import type { Request, Response } from 'express';
import { roleService } from '../../domain/services/role.service.js';

export const roleController = {
  async getAll(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const roles = await roleService.getAll(tenantId);

    res.json({ success: true, data: roles });
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const role = await roleService.getById(req.params.id, tenantId);

    res.json({ success: true, data: role });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const role = await roleService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: role });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const role = await roleService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: role });
  },

  async delete(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await roleService.delete(req.params.id, tenantId);

    res.json({ success: true, data: { message: 'Role deleted successfully' } });
  },
};
