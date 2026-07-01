import type { Request, Response } from 'express';
import type { CreateTopUpRequest } from '@hrm/shared';
import { topUpRequestService, type TopUpActor } from '../../domain/services/topup-request.service.js';
import {
  reviewTopUpRequestSchema,
  topUpRequestListQuerySchema,
} from '../validators/topup-request.validator.js';

function actor(req: Request): TopUpActor {
  return { userId: req.user!.sub, isSuperAdmin: req.user!.role === 'SUPER_ADMIN' };
}
function qStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export const topUpRequestController = {
  async justificationDraft(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await topUpRequestService.justificationDraft(tenantId, {
      issuingEntityId: qStr(req.query.issuingEntityId),
      month: qStr(req.query.month),
    });
    res.json({ success: true, data });
  },

  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = topUpRequestListQuerySchema.parse(req.query);
    const data = await topUpRequestService.list(tenantId, query);
    res.json({ success: true, data });
  },

  async getById(req: Request, res: Response) {
    const data = await topUpRequestService.getById(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const data = await topUpRequestService.create(req.user!.tenantId, actor(req), req.body as CreateTopUpRequest);
    res.status(201).json({ success: true, data });
  },

  async cancel(req: Request, res: Response) {
    const data = await topUpRequestService.cancel(req.params.id, req.user!.tenantId, actor(req));
    res.json({ success: true, data });
  },

  async review(req: Request, res: Response) {
    const body = reviewTopUpRequestSchema.parse(req.body);
    const data = await topUpRequestService.review(req.params.id, req.user!.tenantId, actor(req), body);
    res.json({ success: true, data });
  },

  async pdf(req: Request, res: Response) {
    const { buffer, filename } = await topUpRequestService.pdf(req.params.id, req.user!.tenantId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },
};
