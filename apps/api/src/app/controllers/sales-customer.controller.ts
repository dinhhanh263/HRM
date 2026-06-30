import type { Request, Response } from 'express';
import { customerService } from '../../domain/sales/customer.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import type { CustomerScope } from '../../domain/sales/customer.normalize.js';
import { parseCustomerImport, buildImportTemplate, type ImportFileFormat } from '../../domain/sales/customer-import.js';
import { BadRequestError } from '../../shared/errors/index.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  assignOwnerSchema,
  bulkAssignSchema,
} from '../validators/sales-customer.validator.js';

/** The acting employee's id (null for a profile-less admin), for activity authorship. */
async function actorEmployeeId(req: Request): Promise<string | null> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return employee?.id ?? null;
}

/** Resolve the caller's owner-visibility: view_all sees the tenant; otherwise own + Lead Pool. */
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

export const salesCustomerController = {
  async list(req: Request, res: Response) {
    const input = listCustomersQuerySchema.parse(req.query);
    const scope = await resolveScope(req);
    const data = await customerService.list(req.user!.tenantId, scope, input);
    res.json({ success: true, data });
  },

  async get(req: Request, res: Response) {
    const data = await customerService.get(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createCustomerSchema.parse(req.body);
    const data = await customerService.create(req.user!.tenantId, await actorEmployeeId(req), input);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateCustomerSchema.parse(req.body);
    const data = await customerService.update(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },

  async listOwners(req: Request, res: Response) {
    const data = await customerService.listOwners(req.user!.tenantId);
    res.json({ success: true, data });
  },

  async claim(req: Request, res: Response) {
    const data = await customerService.claim(req.user!.tenantId, req.params.id, await actorEmployeeId(req));
    res.json({ success: true, data });
  },

  async assign(req: Request, res: Response) {
    const { ownerId } = assignOwnerSchema.parse(req.body);
    const data = await customerService.assign(req.user!.tenantId, req.params.id, ownerId, await actorEmployeeId(req));
    res.json({ success: true, data });
  },

  async bulkAssign(req: Request, res: Response) {
    const { customerIds, ownerId } = bulkAssignSchema.parse(req.body);
    const data = await customerService.bulkAssign(req.user!.tenantId, customerIds, ownerId, await actorEmployeeId(req));
    res.json({ success: true, data });
  },

  async downloadImportTemplate(req: Request, res: Response) {
    const format: ImportFileFormat = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const buffer = await buildImportTemplate(format);
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const mime = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="customer-import-template.${ext}"`);
    res.send(buffer);
  },

  async importCustomers(req: Request, res: Response) {
    if (!req.file) throw new BadRequestError('Chưa chọn file');
    const name = (req.file.originalname || '').toLowerCase();
    const format: ImportFileFormat = name.endsWith('.csv') ? 'csv' : 'xlsx';
    const rows = await parseCustomerImport(req.file.buffer, format);
    const commit = req.query.dryRun !== '1' && req.query.dryRun !== 'true';
    const result = await customerService.importCustomers(req.user!.tenantId, rows, commit);
    res.json({ success: true, data: result });
  },

  async changeLifecycle(req: Request, res: Response) {
    // Body validated + narrowed by validate(changeLifecycleSchema) middleware.
    const { lifecycleStatus, lostReason } = req.body as import('../validators/sales-customer.validator.js').ChangeLifecycleInput;
    const data = await customerService.changeLifecycle(
      req.user!.tenantId,
      req.params.id,
      lifecycleStatus,
      lostReason,
      await actorEmployeeId(req),
    );
    res.json({ success: true, data });
  },
};
