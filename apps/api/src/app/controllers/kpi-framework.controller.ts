import type { Request, Response } from 'express';
import { kpiFrameworkService as svc } from '../../domain/services/kpi-framework.service.js';

const tid = (req: Request) => req.user!.tenantId;

export const kpiFrameworkController = {
  // Framework
  async getAll(req: Request, res: Response) {
    res.json({ success: true, data: await svc.getAll(tid(req)) });
  },
  async getById(req: Request, res: Response) {
    res.json({ success: true, data: await svc.getById(req.params.id, tid(req)) });
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
  async validate(req: Request, res: Response) {
    res.json({ success: true, data: await svc.validate(req.params.id, tid(req)) });
  },

  // Pillars
  async addPillar(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.addPillar(req.params.id, tid(req), req.body) });
  },
  async updatePillar(req: Request, res: Response) {
    res.json({ success: true, data: await svc.updatePillar(req.params.id, req.params.pillarId, tid(req), req.body) });
  },
  async removePillar(req: Request, res: Response) {
    res.json({ success: true, data: await svc.removePillar(req.params.id, req.params.pillarId, tid(req)) });
  },

  // Definitions
  async addDefinition(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.addDefinition(req.params.id, req.params.pillarId, tid(req), req.body) });
  },
  async updateDefinition(req: Request, res: Response) {
    res.json({ success: true, data: await svc.updateDefinition(req.params.id, req.params.defId, tid(req), req.body) });
  },
  async removeDefinition(req: Request, res: Response) {
    res.json({ success: true, data: await svc.removeDefinition(req.params.id, req.params.defId, tid(req)) });
  },

  // Weight profiles
  async addProfile(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.addProfile(req.params.id, tid(req), req.body) });
  },
  async updateProfile(req: Request, res: Response) {
    res.json({ success: true, data: await svc.updateProfile(req.params.id, req.params.profileId, tid(req), req.body) });
  },
  async removeProfile(req: Request, res: Response) {
    res.json({ success: true, data: await svc.removeProfile(req.params.id, req.params.profileId, tid(req)) });
  },

  // Rating bands
  async addBand(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.addBand(req.params.id, tid(req), req.body) });
  },
  async updateBand(req: Request, res: Response) {
    res.json({ success: true, data: await svc.updateBand(req.params.id, req.params.bandId, tid(req), req.body) });
  },
  async removeBand(req: Request, res: Response) {
    res.json({ success: true, data: await svc.removeBand(req.params.id, req.params.bandId, tid(req)) });
  },

  // Department assignment
  async setDepartments(req: Request, res: Response) {
    res.json({ success: true, data: await svc.setDepartments(req.params.id, tid(req), req.body.departmentIds) });
  },
};
