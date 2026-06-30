import type { Request, Response } from 'express';
import { salesPipelineService } from '../../domain/sales/pipeline.service.js';
import {
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
} from '../validators/sales-pipeline.validator.js';

export const salesPipelineController = {
  async listPipelines(req: Request, res: Response) {
    const data = await salesPipelineService.list(req.user!.tenantId);
    res.json({ success: true, data });
  },

  async getStages(req: Request, res: Response) {
    const data = await salesPipelineService.getStages(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async createStage(req: Request, res: Response) {
    const input = createStageSchema.parse(req.body);
    const data = await salesPipelineService.createStage(req.user!.tenantId, req.params.id, input);
    res.status(201).json({ success: true, data });
  },

  async updateStage(req: Request, res: Response) {
    const input = updateStageSchema.parse(req.body);
    const data = await salesPipelineService.updateStage(req.user!.tenantId, req.params.stageId, input);
    res.json({ success: true, data });
  },

  async deleteStage(req: Request, res: Response) {
    await salesPipelineService.deleteStage(req.user!.tenantId, req.params.stageId);
    res.status(204).send();
  },

  async reorderStages(req: Request, res: Response) {
    const { orderedIds } = reorderStagesSchema.parse(req.body);
    const data = await salesPipelineService.reorderStages(req.user!.tenantId, req.params.id, orderedIds);
    res.json({ success: true, data });
  },
};
