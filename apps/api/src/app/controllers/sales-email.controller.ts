import type { Request, Response } from 'express';
import { salesEmailService } from '../../domain/sales/email.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  sendEmailSchema,
} from '../validators/sales-email.validator.js';

async function actorEmployeeId(req: Request): Promise<string | null> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return employee?.id ?? null;
}

export const salesEmailController = {
  async listTemplates(req: Request, res: Response) {
    const data = await salesEmailService.listTemplates(req.user!.tenantId);
    res.json({ success: true, data });
  },
  async createTemplate(req: Request, res: Response) {
    const input = createTemplateSchema.parse(req.body);
    const data = await salesEmailService.createTemplate(req.user!.tenantId, input);
    res.status(201).json({ success: true, data });
  },
  async updateTemplate(req: Request, res: Response) {
    const input = updateTemplateSchema.parse(req.body);
    const data = await salesEmailService.updateTemplate(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },
  async listForCustomer(req: Request, res: Response) {
    const data = await salesEmailService.listForCustomer(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },
  async send(req: Request, res: Response) {
    const input = sendEmailSchema.parse(req.body);
    const data = await salesEmailService.send(req.user!.tenantId, await actorEmployeeId(req), input);
    res.status(201).json({ success: true, data });
  },
};
