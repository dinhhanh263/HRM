import type { Request, Response } from 'express';
import { kpiSurveyService as svc } from '../../domain/services/kpi-survey.service.js';

const tid = (req: Request) => req.user!.tenantId;

export const kpiSurveyController = {
  async list(req: Request, res: Response) {
    res.json({ success: true, data: await svc.list(tid(req), req.query.frameworkId as string | undefined) });
  },
  async listActive(req: Request, res: Response) {
    res.json({ success: true, data: await svc.listActive(tid(req)) });
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
  async addQuestion(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.addQuestion(req.params.id, tid(req), req.body) });
  },
  async removeQuestion(req: Request, res: Response) {
    res.json({ success: true, data: await svc.removeQuestion(req.params.id, req.params.questionId, tid(req)) });
  },
  async respond(req: Request, res: Response) {
    await svc.respond(req.params.id, tid(req), req.user!.sub, req.body);
    res.status(201).json({ success: true, data: { message: 'recorded' } });
  },
};
