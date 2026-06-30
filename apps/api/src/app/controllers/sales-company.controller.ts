import type { Request, Response } from 'express';
import { companyService } from '../../domain/sales/company.service.js';
import {
  createCompanySchema,
  updateCompanySchema,
  listCompaniesQuerySchema,
} from '../validators/sales-company.validator.js';

export const salesCompanyController = {
  async list(req: Request, res: Response) {
    const input = listCompaniesQuerySchema.parse(req.query);
    const data = await companyService.list(req.user!.tenantId, input);
    res.json({ success: true, data });
  },

  async get(req: Request, res: Response) {
    const data = await companyService.get(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createCompanySchema.parse(req.body);
    const data = await companyService.create(req.user!.tenantId, input);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateCompanySchema.parse(req.body);
    const data = await companyService.update(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },
};
