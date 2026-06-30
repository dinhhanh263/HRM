import type { Request, Response } from 'express';
import { z } from 'zod';
import { salesActivityService } from '../../domain/sales/activity.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';

const noteSchema = z.object({ body: z.string().trim().min(1, 'Nội dung ghi chú là bắt buộc').max(2000) });

export const salesActivityController = {
  async list(req: Request, res: Response) {
    const data = await salesActivityService.listForCustomer(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async addNote(req: Request, res: Response) {
    const { body } = noteSchema.parse(req.body);
    const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
    const data = await salesActivityService.addNote(req.user!.tenantId, req.params.id, employee?.id ?? null, body);
    res.status(201).json({ success: true, data });
  },
};
