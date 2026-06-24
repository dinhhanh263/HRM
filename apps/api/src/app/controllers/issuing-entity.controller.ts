import type { Request, Response } from 'express';
import type { CreateIssuingEntityRequest, UpdateIssuingEntityRequest } from '@hrm/shared';
import { issuingEntityService } from '../../domain/services/issuing-entity.service.js';
import { BadRequestError } from '../../shared/errors/index.js';
import { logger } from '../../shared/utils/logger.js';

export const issuingEntityController = {
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    // `?activeOnly=1` → dropdown (active only); anything else → full management list.
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    const data = await issuingEntityService.list(tenantId, activeOnly);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await issuingEntityService.create(tenantId, req.body as CreateIssuingEntityRequest);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await issuingEntityService.update(
      req.params.id,
      tenantId,
      req.body as UpdateIssuingEntityRequest,
    );
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await issuingEntityService.remove(req.params.id, tenantId);
    res.status(204).send();
  },

  async uploadLogo(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const file = req.file;
    if (!file) {
      throw new BadRequestError('Chưa có tệp nào được tải lên (trường "file")', 'ENTITY_LOGO_NO_FILE');
    }
    const data = await issuingEntityService.setLogo(req.params.id, tenantId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    res.json({ success: true, data });
  },

  async deleteLogo(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await issuingEntityService.clearLogo(req.params.id, tenantId);
    res.json({ success: true, data });
  },

  async getLogo(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { stream, contentType } = await issuingEntityService.getLogoStream(
      req.params.id,
      tenantId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', (err: unknown) => {
      logger.error({ err, entityId: req.params.id }, 'Issuing entity logo stream failed');
      if (!res.headersSent) res.status(404).end();
      else res.destroy();
    });
    stream.pipe(res);
  },
};
