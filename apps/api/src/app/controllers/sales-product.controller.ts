import type { Request, Response } from 'express';
import { productService } from '../../domain/sales/product.service.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from '../validators/sales-product.validator.js';

export const salesProductController = {
  async list(req: Request, res: Response) {
    const input = listProductsQuerySchema.parse(req.query);
    const data = await productService.list(req.user!.tenantId, input);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const input = createProductSchema.parse(req.body);
    const data = await productService.create(req.user!.tenantId, input);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const input = updateProductSchema.parse(req.body);
    const data = await productService.update(req.user!.tenantId, req.params.id, input);
    res.json({ success: true, data });
  },

  async remove(req: Request, res: Response) {
    await productService.remove(req.user!.tenantId, req.params.id);
    res.status(204).send();
  },
};
