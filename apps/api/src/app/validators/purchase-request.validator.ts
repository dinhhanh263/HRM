import { z } from 'zod';

// SPEC-042: Decimal(14,2) → tối đa ~999 tỷ. quantity Decimal(14,3) hỗ trợ số lẻ.
const quantitySchema = z
  .number()
  .positive('Số lượng phải lớn hơn 0')
  .max(99_999_999.999, 'Số lượng vượt giới hạn cho phép');

const unitPriceSchema = z
  .number()
  .nonnegative('Đơn giá không được âm')
  .max(999_999_999_999.99, 'Đơn giá vượt giới hạn cho phép');

const taxRateSchema = z.number().min(0, 'VAT tối thiểu 0%').max(100, 'VAT tối đa 100%');

const itemSchema = z.object({
  sku: z.string().max(100).optional().nullable(),
  productName: z.string().trim().min(1, 'Tên sản phẩm là bắt buộc').max(300),
  unit: z.string().max(50).optional().nullable(),
  quantity: quantitySchema,
  unitPrice: unitPriceSchema,
  taxRate: taxRateSchema.optional(),
});

const purchaseStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
  'ORDERED',
]);

const purchaseBodyBase = {
  title: z.string().trim().min(1, 'Tiêu đề là bắt buộc').max(200),
  description: z.string().max(2000).optional().nullable(),
  vendorName: z.string().trim().min(1, 'Tên nhà cung cấp là bắt buộc').max(200),
  expectedDeliveryDate: z.string().datetime().optional().nullable(),
  currency: z.string().trim().min(1).max(8).optional(),
  // SPEC-043: pháp nhân phát hành (tùy chọn); server resolve + snapshot, validate tenant scope.
  issuingEntityId: z.string().trim().min(1).max(64).optional().nullable(),
  items: z.array(itemSchema).min(1, 'Phiếu phải có ít nhất một dòng hàng').max(200),
};

export const createPurchaseRequestSchema = z.object(purchaseBodyBase);

// Update & resubmit replace the full request including items → same shape as create.
export const updatePurchaseRequestSchema = z.object(purchaseBodyBase);

// "Trả về" và "Từ chối" dùng chung một endpoint, phân biệt bằng mode; note bắt buộc.
export const rejectPurchaseRequestSchema = z.object({
  mode: z.enum(['return', 'reject']),
  note: z.string().trim().min(1, 'Cần nhập lý do').max(1000),
});

export const approvePurchaseRequestSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});

export const markOrderedPurchaseRequestSchema = z.object({
  orderNote: z.string().max(1000).optional().nullable(),
});

export const purchaseRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  scope: z.enum(['mine', 'review', 'all']).optional(),
  status: purchaseStatusEnum.optional(),
  vendorName: z.string().trim().min(1).optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type UpdatePurchaseRequestInput = z.infer<typeof updatePurchaseRequestSchema>;
export type PurchaseRequestQueryInput = z.infer<typeof purchaseRequestQuerySchema>;
