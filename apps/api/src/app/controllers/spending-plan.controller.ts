import type { Request, Response } from 'express';
import type { CreateSpendingPlanRequest, UpdateSpendingPlanRequest } from '@hrm/shared';
import { spendingPlanService, type PlanActor } from '../../domain/services/spending-plan.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import {
  spendingPlanListQuerySchema,
  reviewSpendingPlanSchema,
} from '../validators/spending-plan.validator.js';

async function resolveActor(req: Request): Promise<PlanActor> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return {
    userId: req.user!.sub,
    employeeId: employee?.id ?? null,
    isSuperAdmin: req.user!.role === 'SUPER_ADMIN',
  };
}

// scope=all + review actions need approve/reject capability (route only checks view).
async function canReviewAll(req: Request): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') return true;
  if (!user.roleId) return false;
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('spending_plan:approve') || granted.has('spending_plan:reject');
}

export const spendingPlanController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = spendingPlanListQuerySchema.parse(req.query);
    if (query.scope === 'all' && !(await canReviewAll(req))) {
      throw new ForbiddenError('Bạn không có quyền xem toàn bộ kế hoạch chi');
    }
    const actor = await resolveActor(req);
    const data = await spendingPlanService.list(tenantId, actor, query);
    res.json({ success: true, data });
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await resolveActor(req);
    const data = await spendingPlanService.getById(req.params.id, tenantId, actor, await canReviewAll(req));
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await resolveActor(req);
    const data = await spendingPlanService.create(tenantId, actor, req.body as CreateSpendingPlanRequest);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await resolveActor(req);
    const data = await spendingPlanService.update(req.params.id, tenantId, actor, req.body as UpdateSpendingPlanRequest);
    res.json({ success: true, data });
  },

  async submit(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await resolveActor(req);
    const data = await spendingPlanService.submit(req.params.id, tenantId, actor);
    res.json({ success: true, data });
  },

  async review(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await resolveActor(req);
    const { decision, note } = reviewSpendingPlanSchema.parse(req.body);
    const data = await spendingPlanService.review(req.params.id, tenantId, actor, decision, note);
    res.json({ success: true, data });
  },
};
