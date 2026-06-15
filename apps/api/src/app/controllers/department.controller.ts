import type { Request, Response } from 'express';
import { departmentService } from '../../domain/services/department.service.js';

export const departmentController = {
  async getAll(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const departments = await departmentService.getAll(tenantId);

    res.json({
      success: true,
      data: departments,
    });
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const department = await departmentService.getById(req.params.id, tenantId);

    res.json({
      success: true,
      data: department,
    });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const department = await departmentService.create(tenantId, req.body);

    res.status(201).json({
      success: true,
      data: department,
    });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const department = await departmentService.update(req.params.id, tenantId, req.body);

    res.json({
      success: true,
      data: department,
    });
  },

  async delete(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await departmentService.delete(req.params.id, tenantId);

    res.json({
      success: true,
      data: { message: 'Department deleted successfully' },
    });
  },
};
