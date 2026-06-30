import type { Request, Response } from 'express';
import { salesReportService } from '../../domain/sales/report.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import type { CustomerScope } from '../../domain/sales/customer.normalize.js';

async function resolveScope(req: Request): Promise<CustomerScope> {
  const user = req.user!;
  const employee = await employeeRepository.findByUserId(user.sub, user.tenantId);
  let canViewAll = user.role === 'SUPER_ADMIN';
  if (!canViewAll && user.roleId) {
    const granted = await permissionService.getPermissionsForRole(user.roleId);
    canViewAll = granted.has('sales:view_all');
  }
  return { canViewAll, employeeId: employee?.id ?? null };
}

export const salesReportController = {
  async overview(req: Request, res: Response) {
    const data = await salesReportService.overview(req.user!.tenantId, await resolveScope(req));
    res.json({ success: true, data });
  },
  async forecast(req: Request, res: Response) {
    const data = await salesReportService.forecast(req.user!.tenantId, await resolveScope(req));
    res.json({ success: true, data });
  },
  async byOwner(req: Request, res: Response) {
    const scope = await resolveScope(req);
    if (!scope.canViewAll) throw new ForbiddenError('Cần quyền xem toàn nhóm');
    const data = await salesReportService.byOwner(req.user!.tenantId);
    res.json({ success: true, data });
  },
};
