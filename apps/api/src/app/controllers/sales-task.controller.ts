import type { Request, Response } from 'express';
import type { SalesTaskStatus } from '@prisma/client';
import { salesTaskService } from '../../domain/sales/task.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { createTaskSchema, updateTaskSchema } from '../validators/sales-task.validator.js';

async function actorEmployeeId(req: Request): Promise<string | null> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return employee?.id ?? null;
}

export const salesTaskController = {
  async listMine(req: Request, res: Response) {
    const status = req.query.status as SalesTaskStatus | undefined;
    const data = await salesTaskService.listMine(req.user!.tenantId, await actorEmployeeId(req), status);
    res.json({ success: true, data });
  },

  async listForCustomer(req: Request, res: Response) {
    const data = await salesTaskService.listForCustomer(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createTaskSchema.parse(req.body);
    const data = await salesTaskService.create(req.user!.tenantId, await actorEmployeeId(req), input);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateTaskSchema.parse(req.body);
    const data = await salesTaskService.update(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },

  async complete(req: Request, res: Response) {
    const data = await salesTaskService.complete(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },
};
