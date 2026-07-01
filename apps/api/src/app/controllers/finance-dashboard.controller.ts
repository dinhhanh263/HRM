import type { Request, Response } from 'express';
import { financeDashboardService } from '../../domain/services/finance-dashboard.service.js';
import { financeReportService } from '../../domain/services/finance-report.service.js';
import { buildFinanceReportExcel } from '../../domain/finance-report/finance-report.excel.js';

function qStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function qYear(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : undefined;
  return n && Number.isInteger(n) ? n : undefined;
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

  async report(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeReportService.report(tenantId, {
      year: qYear(req.query.year),
      issuingEntityId: qStr(req.query.issuingEntityId),
    });
    res.json({ success: true, data });
  },

  async reportExport(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await financeReportService.report(tenantId, {
      year: qYear(req.query.year),
      issuingEntityId: qStr(req.query.issuingEntityId),
    });
    const buffer = await buildFinanceReportExcel(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-tai-chinh-${data.year}.xlsx"`);
    res.send(buffer);
  },
};
