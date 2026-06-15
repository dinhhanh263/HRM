import type { Request, Response } from 'express';
import { notificationService } from '../../domain/services/notification.service.js';
import { notificationQuerySchema } from '../validators/notification.validator.js';

export const notificationController = {
  async list(req: Request, res: Response) {
    const { page, limit } = notificationQuerySchema.parse(req.query);
    const result = await notificationService.list(req.user!.sub, req.user!.tenantId, {
      page,
      limit,
    });

    res.json({ success: true, data: result });
  },

  async markRead(req: Request, res: Response) {
    const notification = await notificationService.markRead(
      req.params.id,
      req.user!.sub,
      req.user!.tenantId,
    );

    res.json({ success: true, data: notification });
  },

  async markAllRead(req: Request, res: Response) {
    const result = await notificationService.markAllRead(req.user!.sub, req.user!.tenantId);

    res.json({ success: true, data: result });
  },
};
