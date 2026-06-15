import type { Request, Response } from 'express';
import { settingsService } from '../../domain/services/settings.service.js';

export const settingsController = {
  async getSettings(req: Request, res: Response) {
    const data = await settingsService.getSettings(req.user!.tenantId);
    res.json({ success: true, data });
  },

  async getPublicSettings(req: Request, res: Response) {
    const data = await settingsService.getPublicSettings(req.user!.tenantId);
    res.json({ success: true, data });
  },

  async patchSection(req: Request, res: Response) {
    const user = req.user!;
    const data = await settingsService.patchSection(
      user.tenantId,
      user.sub,
      req.params.section,
      req.body,
    );
    res.json({ success: true, data });
  },

  async listAudit(req: Request, res: Response) {
    const data = await settingsService.listAudit(req.user!.tenantId);
    res.json({ success: true, data });
  },
};
