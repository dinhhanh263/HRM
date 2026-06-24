import { z } from 'zod';

// SPEC-041: Decimal(14,2) → tối đa ~999 tỷ; chặn số âm/0 và quá lớn ở client-side validate.
const amountSchema = z
  .number()
  .positive('Số tiền phải lớn hơn 0')
  .max(999_999_999_999.99, 'Số tiền vượt giới hạn cho phép');

const paymentTypeEnum = z.enum(['REIMBURSEMENT', 'ADVANCE', 'VENDOR_PAYMENT']);
const paymentStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
  'PAID',
]);

// Field tuỳ-loại được validate bằng superRefine: REIMBURSEMENT cần expenseDate,
// VENDOR_PAYMENT cần vendorName. ADVANCE chỉ cần các field chung.
const paymentBodyBase = {
  type: paymentTypeEnum,
  title: z.string().trim().min(1, 'Tiêu đề là bắt buộc').max(200),
  description: z.string().max(2000).optional().nullable(),
  amount: amountSchema,
  currency: z.string().trim().min(1).max(8).optional(),
  expenseDate: z.string().datetime().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  neededByDate: z.string().datetime().optional().nullable(),
  vendorName: z.string().max(200).optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
};

function refineByType(
  data: { type: string; expenseDate?: string | null; vendorName?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.type === 'REIMBURSEMENT' && !data.expenseDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Ngày chi là bắt buộc cho đơn hoàn ứng',
      path: ['expenseDate'],
    });
  }
  if (data.type === 'VENDOR_PAYMENT' && !data.vendorName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tên nhà cung cấp là bắt buộc cho đơn thanh toán NCC',
      path: ['vendorName'],
    });
  }
}

export const createPaymentRequestSchema = z.object(paymentBodyBase).superRefine(refineByType);

// Update: type cố định không cho đổi (giữ ngữ nghĩa đơn); các field còn lại optional.
export const updatePaymentRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    amount: amountSchema.optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    expenseDate: z.string().datetime().optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    neededByDate: z.string().datetime().optional().nullable(),
    vendorName: z.string().max(200).optional().nullable(),
    invoiceNumber: z.string().max(100).optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Cần ít nhất một trường để cập nhật' });

// "Trả về" và "Từ chối" dùng chung một endpoint, phân biệt bằng mode; note bắt buộc.
export const rejectPaymentRequestSchema = z.object({
  mode: z.enum(['return', 'reject']),
  note: z.string().trim().min(1, 'Cần nhập lý do').max(1000),
});

export const approvePaymentRequestSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});

export const markPaidPaymentRequestSchema = z.object({
  paymentNote: z.string().max(1000).optional().nullable(),
});

export const paymentRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  scope: z.enum(['mine', 'review', 'all']).optional(),
  status: paymentStatusEnum.optional(),
  type: paymentTypeEnum.optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
export type UpdatePaymentRequestInput = z.infer<typeof updatePaymentRequestSchema>;
export type PaymentRequestQueryInput = z.infer<typeof paymentRequestQuerySchema>;
