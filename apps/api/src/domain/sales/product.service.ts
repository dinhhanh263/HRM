import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { CreateProductInput, UpdateProductInput, ListProductsInput } from '../../app/validators/sales-product.validator.js';
import { productRepository } from './product.repository.js';
import { toProductDto } from './mappers.js';

function nullable(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export const productService = {
  async list(tenantId: string, input: ListProductsInput) {
    const { data, total } = await productRepository.list(tenantId, {
      search: input.search,
      status: input.status,
      page: input.page,
      limit: input.limit,
    });
    return { items: data.map(toProductDto), total, page: input.page, limit: input.limit };
  },

  async create(tenantId: string, input: CreateProductInput) {
    const created = await productRepository.create({
      tenantId,
      name: input.name.trim(),
      sku: nullable(input.sku),
      description: nullable(input.description),
      unitPrice: input.unitPrice ?? 0,
      currency: input.currency ?? 'VND',
      unit: nullable(input.unit),
    });
    return toProductDto(created);
  },

  async update(tenantId: string, id: string, input: UpdateProductInput) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.sku !== undefined) data.sku = nullable(input.sku);
    if (input.description !== undefined) data.description = nullable(input.description);
    if (input.unitPrice !== undefined) data.unitPrice = input.unitPrice;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.unit !== undefined) data.unit = nullable(input.unit);
    if (input.status !== undefined) data.status = input.status;
    const updated = await productRepository.update(tenantId, id, data);
    if (!updated) throw new NotFoundError('Không tìm thấy sản phẩm');
    return toProductDto(updated);
  },

  /** Delete only if never used in a quote; otherwise the caller should archive instead. */
  async remove(tenantId: string, id: string) {
    const existing = await productRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError('Không tìm thấy sản phẩm');
    const used = await productRepository.usageCount(id);
    if (used > 0) {
      throw new ConflictError('Sản phẩm đã dùng trong báo giá — hãy lưu trữ thay vì xóa', 'PRODUCT_IN_USE');
    }
    await productRepository.remove(tenantId, id);
  },
};
