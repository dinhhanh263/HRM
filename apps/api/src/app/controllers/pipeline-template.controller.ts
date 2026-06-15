import type { Request, Response } from 'express';
import { pipelineTemplateService } from '../../domain/services/pipeline-template.service.js';

export const pipelineTemplateController = {
  async getAll(req: Request, res: Response) {
    const data = await pipelineTemplateService.getAll(req.user!.tenantId);
    res.json({ success: true, data });
  },

  async getById(req: Request, res: Response) {
    const data = await pipelineTemplateService.getById(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const data = await pipelineTemplateService.create(req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const data = await pipelineTemplateService.update(req.params.id, req.user!.tenantId, req.body);
    res.json({ success: true, data });
  },

  async delete(req: Request, res: Response) {
    await pipelineTemplateService.delete(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: { message: 'Pipeline template deleted' } });
  },
};
