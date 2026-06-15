import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { employeeService } from '../../domain/services/employee.service.js';
import { employeeQuerySchema } from '../validators/employee.validator.js';

// Only SUPER_ADMIN may assign/alter a system role through the employee form;
// for everyone else the `role` field is ignored (see employeeService.create).
function canAssignRole(req: Request): boolean {
  return req.user!.role === UserRole.SUPER_ADMIN;
}

export const employeeController = {
  async getAll(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = employeeQuerySchema.parse(req.query);

    const { page, limit, ...filters } = query;
    const requester = { userId: req.user!.sub, role: req.user!.role };
    const result = await employeeService.getAll(tenantId, filters, { page, limit }, requester);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const requester = { userId: req.user!.sub, role: req.user!.role };
    const employee = await employeeService.getById(req.params.id, tenantId, requester);

    res.json({
      success: true,
      data: employee,
    });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await employeeService.create(tenantId, req.body, canAssignRole(req));

    res.status(201).json({
      success: true,
      data: employee,
    });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await employeeService.update(
      req.params.id,
      tenantId,
      req.body,
      canAssignRole(req)
    );

    res.json({
      success: true,
      data: employee,
    });
  },

  async activate(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await employeeService.activate(req.params.id, tenantId);

    res.json({
      success: true,
      data: employee,
    });
  },

  async deactivate(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await employeeService.deactivate(req.params.id, tenantId);

    res.json({
      success: true,
      data: employee,
    });
  },

  async terminate(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await employeeService.terminate(req.params.id, tenantId);

    res.json({
      success: true,
      data: employee,
    });
  },
};
