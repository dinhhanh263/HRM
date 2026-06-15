import type { Request, Response } from 'express';
import { positionService } from '../../domain/services/position.service.js';

export const positionController = {
  async getAll(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const positions = await positionService.getAll(tenantId);

    res.json({
      success: true,
      data: positions,
    });
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const position = await positionService.getById(req.params.id, tenantId);

    res.json({
      success: true,
      data: position,
    });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const position = await positionService.create(tenantId, req.body);

    res.status(201).json({
      success: true,
      data: position,
    });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const position = await positionService.update(req.params.id, tenantId, req.body);

    res.json({
      success: true,
      data: position,
    });
  },

  async delete(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await positionService.delete(req.params.id, tenantId);

    res.json({
      success: true,
      data: { message: 'Position deleted successfully' },
    });
  },
};
