import type { Request, Response } from 'express';
import { kpiTeamService as svc } from '../../domain/services/kpi-team.service.js';

const tid = (req: Request) => req.user!.tenantId;

export const kpiTeamController = {
  async getAll(req: Request, res: Response) {
    res.json({ success: true, data: await svc.getAll(tid(req)) });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.create(tid(req), req.body) });
  },
  async update(req: Request, res: Response) {
    res.json({ success: true, data: await svc.update(req.params.id, tid(req), req.body) });
  },
  async remove(req: Request, res: Response) {
    await svc.remove(req.params.id, tid(req));
    res.json({ success: true, data: { message: 'deleted' } });
  },
};
