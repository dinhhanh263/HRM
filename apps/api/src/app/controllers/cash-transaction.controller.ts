import type { Request, Response } from 'express';
import type { CreateCashTransactionRequest, UpdateCashTransactionRequest } from '@hrm/shared';
import { cashTransactionService } from '../../domain/services/cash-transaction.service.js';
import { cashTransactionListQuerySchema } from '../validators/cash-transaction.validator.js';

export const cashTransactionController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = cashTransactionListQuerySchema.parse(req.query);
    const data = await cashTransactionService.list(tenantId, query);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.sub;
    const data = await cashTransactionService.create(
      tenantId,
      userId,
      req.body as CreateCashTransactionRequest,
    );
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await cashTransactionService.update(
      req.params.id,
      tenantId,
      req.body as UpdateCashTransactionRequest,
    );
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await cashTransactionService.remove(req.params.id, tenantId);
    res.status(204).send();
  },
};
