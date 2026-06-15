import type { Request, Response } from 'express';
import type { UserRole } from '@hrm/shared';
import { dashboardService } from '../../domain/services/dashboard.service.js';
import { ValidationError } from '../../shared/errors/AppError.js';

// SPEC-035: calendar months are addressed as `YYYY-MM`.
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const dashboardController = {
  async getDashboard(req: Request, res: Response) {
    const user = req.user!;
    const data = await dashboardService.getDashboard({
      sub: user.sub,
      tenantId: user.tenantId,
      role: user.role as UserRole,
      roleId: user.roleId,
    });

    res.json({ success: true, data });
  },

  async getCalendarEvents(req: Request, res: Response) {
    const user = req.user!;
    const month = req.query.month;
    if (typeof month !== 'string' || !MONTH_KEY_PATTERN.test(month)) {
      throw new ValidationError('month must be in YYYY-MM format');
    }

    const data = await dashboardService.getCalendarEvents(
      {
        sub: user.sub,
        tenantId: user.tenantId,
        role: user.role as UserRole,
        roleId: user.roleId,
      },
      month,
    );

    res.json({ success: true, data });
  },
};
