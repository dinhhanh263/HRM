import type { Request, Response } from 'express';
import { interviewService } from '../../domain/services/interview.service.js';

export const interviewController = {
  async create(req: Request, res: Response) {
    const data = await interviewService.create(req.user!.tenantId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async listByApplication(req: Request, res: Response) {
    const data = await interviewService.listByApplication(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async listMine(req: Request, res: Response) {
    const data = await interviewService.listMine(req.user!.tenantId, req.user!.sub);
    res.json({ success: true, data });
  },

  async updateStatus(req: Request, res: Response) {
    const data = await interviewService.updateStatus(
      req.user!.tenantId,
      req.params.id,
      req.params.interviewId,
      req.body
    );
    res.json({ success: true, data });
  },
};
