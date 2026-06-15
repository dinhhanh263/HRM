import type { Request, Response } from 'express';
import { scorecardService } from '../../domain/services/scorecard.service.js';

export const scorecardController = {
  async submit(req: Request, res: Response) {
    const data = await scorecardService.submit(
      req.user!.tenantId,
      req.user!.sub,
      req.params.interviewId,
      req.body
    );
    res.json({ success: true, data });
  },

  async listForInterview(req: Request, res: Response) {
    const data = await scorecardService.listForInterview(
      req.user!.tenantId,
      req.user!.sub,
      req.params.interviewId
    );
    res.json({ success: true, data });
  },

  async summaryByApplication(req: Request, res: Response) {
    const data = await scorecardService.summaryByApplication(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id
    );
    res.json({ success: true, data });
  },
};
