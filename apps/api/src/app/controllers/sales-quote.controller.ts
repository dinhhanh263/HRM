import type { Request, Response } from 'express';
import { quoteService } from '../../domain/sales/quote.service.js';
import { buildQuotePdf } from '../../domain/sales/quote.pdf.js';
import { createQuoteSchema, updateQuoteSchema } from '../validators/sales-quote.validator.js';

export const salesQuoteController = {
  async listByDeal(req: Request, res: Response) {
    const data = await quoteService.listByDeal(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createQuoteSchema.parse(req.body);
    const data = await quoteService.create(req.user!.tenantId, req.params.id, input);
    res.status(201).json({ success: true, data });
  },

  async get(req: Request, res: Response) {
    const data = await quoteService.get(req.user!.tenantId, req.params.quoteId);
    res.json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateQuoteSchema.parse(req.body);
    const data = await quoteService.update(req.user!.tenantId, req.params.quoteId, input);
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    await quoteService.remove(req.user!.tenantId, req.params.quoteId);
    res.status(204).send();
  },

  async pdf(req: Request, res: Response) {
    const data = await quoteService.pdfData(req.user!.tenantId, req.params.quoteId);
    const buffer = await buildQuotePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bao-gia-${data.code}.pdf"`);
    res.send(buffer);
  },
};
