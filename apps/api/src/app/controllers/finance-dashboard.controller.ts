import type { Request, Response } from 'express';
import { financeDashboardService } from '../../domain/services/finance-dashboard.service.js';
import { financeReportService } from '../../domain/services/finance-report.service.js';

function qStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export const financeDashboardController = {
  async dashboard(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeDashboardService.get(tenantId, {
      issuingEntityId: qStr(req.query.issuingEntityId),
      month: qStr(req.query.month),
    });
    res.json({ success: true, data });
  },

  async budgetVsActual(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeReportService.budgetVsActual(tenantId, {
      issuingEntityId: qStr(req.query.issuingEntityId),
      month: qStr(req.query.month),
    });
    res.json({ success: true, data });
  },

  async forecast(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeReportService.forecast(tenantId, {
      issuingEntityId: qStr(req.query.issuingEntityId),
      month: qStr(req.query.month),
    });
    res.json({ success: true, data });
  },
};
