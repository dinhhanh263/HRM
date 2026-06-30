import type { Request, Response } from 'express';
import { dealService } from '../../domain/sales/deal.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import type { CustomerScope } from '../../domain/sales/customer.normalize.js';
import {
  createDealSchema,
  updateDealSchema,
  listDealsQuerySchema,
  moveDealSchema,
  loseDealSchema,
} from '../validators/sales-deal.validator.js';

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

async function actorEmployeeId(req: Request): Promise<string | null> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return employee?.id ?? null;
}

export const salesDealController = {
  async list(req: Request, res: Response) {
    const filters = listDealsQuerySchema.parse(req.query);
    const scope = await resolveScope(req);
    const data = await dealService.list(req.user!.tenantId, scope, filters);
    res.json({ success: true, data });
  },

  async get(req: Request, res: Response) {
    const data = await dealService.get(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createDealSchema.parse(req.body);
    const data = await dealService.create(req.user!.tenantId, await actorEmployeeId(req), input);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateDealSchema.parse(req.body);
    const data = await dealService.update(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },

  async move(req: Request, res: Response) {
    const { toStageId, note } = moveDealSchema.parse(req.body);
    const data = await dealService.move(req.user!.tenantId, req.params.id, toStageId, await actorEmployeeId(req), note);
    res.json({ success: true, data });
  },

  async win(req: Request, res: Response) {
    const data = await dealService.win(req.user!.tenantId, req.params.id, await actorEmployeeId(req));
    res.json({ success: true, data });
  },

  async lose(req: Request, res: Response) {
    const { lostReason } = loseDealSchema.parse(req.body);
    const data = await dealService.lose(req.user!.tenantId, req.params.id, lostReason, await actorEmployeeId(req));
    res.json({ success: true, data });
  },
};
