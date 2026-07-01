import type { Request, Response } from 'express';
import { financeDashboardService } from '../../domain/services/finance-dashboard.service.js';

export const financeDashboardController = {
  async dashboard(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const issuingEntityId = typeof req.query.issuingEntityId === 'string' ? req.query.issuingEntityId : undefined;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const data = await financeDashboardService.get(tenantId, { issuingEntityId, month });
    res.json({ success: true, data });
  },
};
