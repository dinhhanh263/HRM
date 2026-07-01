import type { FinanceCategory } from '@prisma/client';
import { financeCategoryRepository } from '../repositories/finance-category.repository.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';
import type {
  FinanceCategoryDto,
  CreateFinanceCategoryRequest,
  UpdateFinanceCategoryRequest,
  FinanceCategoryListQuery,
  CategoryKind,
} from '@hrm/shared';

// Default VN category tree seeded on a tenant's first read (SPEC-048 §Core Feature 2).
const DEFAULT_CATEGORIES: { kind: CategoryKind; name: string }[] = [
  { kind: 'EXPENSE', name: 'Ads / Quảng cáo' },
  { kind: 'EXPENSE', name: 'Hàng hoá' },
  { kind: 'EXPENSE', name: 'Văn phòng phẩm' },
  { kind: 'EXPENSE', name: 'Thuê văn phòng' },
  { kind: 'EXPENSE', name: 'Freelancer' },
  { kind: 'EXPENSE', name: 'Lương' },
  { kind: 'EXPENSE', name: 'Thuế / Phí' },
  { kind: 'EXPENSE', name: 'Khác' },
  { kind: 'INCOME', name: 'Ecom / Bán hàng' },
  // Nạp quỹ/góp vốn từ Founder là dòng tiền vào (financing), KHÔNG phải doanh thu —
  // tách riêng để không thổi phồng "Thu trong kỳ" & làm sai net/dự báo. GĐ3 (TopUp)
  // sẽ tự sinh giao dịch IN vào danh mục này khi Founder duyệt.
  { kind: 'INCOME', name: 'Nạp quỹ / Góp vốn' },
  { kind: 'INCOME', name: 'Nguồn khác' },
];

function toDto(c: FinanceCategory): FinanceCategoryDto {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    parentId: c.parentId,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

export const financeCategoryService = {
  async list(tenantId: string, query: FinanceCategoryListQuery): Promise<FinanceCategoryDto[]> {
    // Lazily seed the default tree the first time a tenant opens the module.
    const total = await financeCategoryRepository.count(tenantId);
    if (total === 0) {
      await financeCategoryRepository.createMany(
        DEFAULT_CATEGORIES.map((c) => ({ tenantId, kind: c.kind, name: c.name })),
      );
    }
    const rows = await financeCategoryRepository.findAll(tenantId, {
      kind: query.kind,
      active: query.active,
    });
    return rows.map(toDto);
  },

  async create(tenantId: string, input: CreateFinanceCategoryRequest): Promise<FinanceCategoryDto> {
    if (input.parentId) {
      const parent = await financeCategoryRepository.findById(input.parentId, tenantId);
      if (!parent) throw new BadRequestError('Danh mục cha không hợp lệ', 'CATEGORY_INVALID_PARENT');
      // Enforce a 2-level tree — a parent cannot itself have a parent.
      if (parent.parentId) throw new BadRequestError('Chỉ hỗ trợ danh mục 2 cấp', 'CATEGORY_TOO_DEEP');
      if (parent.kind !== input.kind) {
        throw new BadRequestError('Danh mục con phải cùng loại với cha', 'CATEGORY_KIND_MISMATCH');
      }
    }
    const created = await financeCategoryRepository.create({
      tenantId,
      kind: input.kind,
      name: input.name.trim(),
      parentId: input.parentId ?? null,
    });
    return toDto(created);
  },

  async update(id: string, tenantId: string, input: UpdateFinanceCategoryRequest): Promise<FinanceCategoryDto> {
    const existing = await financeCategoryRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy danh mục');

    const data: Parameters<typeof financeCategoryRepository.update>[2] = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.active !== undefined) data.active = input.active;
    if (input.parentId !== undefined) {
      if (input.parentId) {
        if (input.parentId === id) throw new BadRequestError('Danh mục không thể là cha của chính nó', 'CATEGORY_SELF_PARENT');
        const parent = await financeCategoryRepository.findById(input.parentId, tenantId);
        if (!parent) throw new BadRequestError('Danh mục cha không hợp lệ', 'CATEGORY_INVALID_PARENT');
        if (parent.parentId) throw new BadRequestError('Chỉ hỗ trợ danh mục 2 cấp', 'CATEGORY_TOO_DEEP');
        if (parent.kind !== existing.kind) throw new BadRequestError('Danh mục con phải cùng loại với cha', 'CATEGORY_KIND_MISMATCH');
      }
      data.parentId = input.parentId;
    }

    const updated = await financeCategoryRepository.update(id, tenantId, data);
    return toDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await financeCategoryRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy danh mục');
    const [txCount, childCount] = await Promise.all([
      financeCategoryRepository.countTransactions(id),
      financeCategoryRepository.countChildren(id),
    ]);
    if (txCount > 0 || childCount > 0) {
      throw new ConflictError(
        'Danh mục đang được sử dụng — hãy vô hiệu hoá thay vì xoá',
        'CATEGORY_IN_USE',
      );
    }
    await financeCategoryRepository.delete(id, tenantId);
  },
};
