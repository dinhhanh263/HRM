import type { Request, Response } from 'express';
import type { CreateFundAccountRequest, UpdateFundAccountRequest } from '@hrm/shared';
import { fundAccountService } from '../../domain/services/fund-account.service.js';
import { fundAccountListQuerySchema } from '../validators/fund-account.validator.js';

export const fundAccountController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = fundAccountListQuerySchema.parse(req.query);
    const data = await fundAccountService.list(tenantId, query);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await fundAccountService.create(tenantId, req.body as CreateFundAccountRequest);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await fundAccountService.update(
      req.params.id,
      tenantId,
      req.body as UpdateFundAccountRequest,
    );
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await fundAccountService.remove(req.params.id, tenantId);
    res.status(204).send();
  },
};
