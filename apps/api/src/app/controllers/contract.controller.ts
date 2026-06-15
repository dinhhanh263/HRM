import type { Request, Response } from 'express';
import { contractService } from '../../domain/services/contract.service.js';

export const contractController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const requester = { userId: req.user!.sub, role: req.user!.role };
    const contracts = await contractService.list(req.params.employeeId, tenantId, requester);

    res.json({ success: true, data: contracts });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const contract = await contractService.create(req.params.employeeId, tenantId, req.body);

    res.status(201).json({ success: true, data: contract });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const contract = await contractService.update(
      req.params.contractId,
      req.params.employeeId,
      tenantId,
      req.body,
    );

    res.json({ success: true, data: contract });
  },

  async end(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const contract = await contractService.end(
      req.params.contractId,
      req.params.employeeId,
      tenantId,
      req.body,
    );

    res.json({ success: true, data: contract });
  },

  async delete(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await contractService.remove(req.params.contractId, req.params.employeeId, tenantId);

    res.json({ success: true, data: { message: 'Contract deleted successfully' } });
  },
};
