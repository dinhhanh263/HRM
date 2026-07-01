import type { Request, Response } from 'express';
import type { CreateFinanceCategoryRequest, UpdateFinanceCategoryRequest } from '@hrm/shared';
import { financeCategoryService } from '../../domain/services/finance-category.service.js';
import { financeCategoryListQuerySchema } from '../validators/finance-category.validator.js';

export const financeCategoryController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = financeCategoryListQuerySchema.parse(req.query);
    const data = await financeCategoryService.list(tenantId, query);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeCategoryService.create(tenantId, req.body as CreateFinanceCategoryRequest);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeCategoryService.update(
      req.params.id,
      tenantId,
      req.body as UpdateFinanceCategoryRequest,
    );
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await financeCategoryService.remove(req.params.id, tenantId);
    res.status(204).send();
  },
};
