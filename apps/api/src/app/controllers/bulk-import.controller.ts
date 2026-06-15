import type { Request, Response } from 'express';
import { bulkImportService } from '../../domain/services/bulk-import.service.js';
import { BadRequestError } from '../../shared/errors/index.js';

export const bulkImportController = {
  async create(req: Request, res: Response) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new BadRequestError(
        'Chưa có tệp nào được tải lên (trường "files")',
        'BULK_IMPORT_NO_FILES'
      );
    }

    const data = await bulkImportService.createBatch(
      req.params.jobId,
      req.user!.tenantId,
      req.user!.sub,
      files.map((f) => ({
        buffer: f.buffer,
        originalName: f.originalname,
        mimeType: f.mimetype,
      }))
    );

    res.status(201).json({ success: true, data });
  },

  async getBatch(req: Request, res: Response) {
    const data = await bulkImportService.getBatch(req.params.batchId, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async updateItem(req: Request, res: Response) {
    const data = await bulkImportService.updateItem(
      req.params.batchId,
      req.params.itemId,
      req.user!.tenantId,
      req.body
    );
    res.json({ success: true, data });
  },

  async cancel(req: Request, res: Response) {
    const data = await bulkImportService.cancelBatch(req.params.batchId, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async confirm(req: Request, res: Response) {
    const data = await bulkImportService.confirm(
      req.params.batchId,
      req.user!.tenantId,
      req.user!.sub
    );
    res.json({ success: true, data });
  },
};
