import { z } from 'zod';

const code = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase letters, digits, hyphen or underscore');

export const createAssetCategorySchema = z.object({
  name: z.string().min(1).max(100),
  code,
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
});

export const updateAssetCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
});

export type CreateAssetCategoryBody = z.infer<typeof createAssetCategorySchema>;
export type UpdateAssetCategoryBody = z.infer<typeof updateAssetCategorySchema>;

// ── Asset (tài sản) ────────────────────────────────────────────────────────

// Accept both a date-only string ("YYYY-MM-DD") and a full ISO datetime.
const dateInput = z.union([z.string().datetime(), z.string().date()]);
const assetCode = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Z0-9_-]+$/, 'Asset code must be uppercase letters, digits, hyphen or underscore');
const conditionEnum = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']);
const statusEnum = z.enum(['AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST']);

export const createAssetSchema = z.object({
  categoryId: z.string().cuid(),
  assetCode,
  name: z.string().min(1).max(150),
  serialNumber: z.string().max(120).optional().nullable(),
  brand: z.string().max(80).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  condition: conditionEnum.optional().nullable(),
  purchaseDate: dateInput.optional().nullable(),
  purchaseCost: z.coerce.number().min(0).max(1_000_000_000_000).optional().nullable(),
  warrantyEndDate: dateInput.optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export const updateAssetSchema = z.object({
  categoryId: z.string().cuid().optional(),
  assetCode: assetCode.optional(),
  name: z.string().min(1).max(150).optional(),
  serialNumber: z.string().max(120).optional().nullable(),
  brand: z.string().max(80).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  condition: conditionEnum.optional().nullable(),
  purchaseDate: dateInput.optional().nullable(),
  purchaseCost: z.coerce.number().min(0).max(1_000_000_000_000).optional().nullable(),
  warrantyEndDate: dateInput.optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

// Chữ ký vẽ tay: PNG data URL. Cap ~360K chars (≈ 270KB ảnh decode) để chặn
// payload quá lớn — chữ ký nét mảnh thực tế chỉ ~10–40KB.
const SIGNATURE_MAX_CHARS = 360_000;
const signatureDataUrl = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, 'Signature must be a PNG data URL')
  .max(SIGNATURE_MAX_CHARS, 'Signature image is too large');
const ackMethodEnum = z.enum(['ON_SCREEN', 'IN_APP']);

export const assignAssetSchema = z.object({
  employeeId: z.string().cuid(),
  assignedAt: dateInput,
  conditionOut: conditionEnum.optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  // Khi HR lấy chữ ký tại chỗ lúc cấp phát (ON_SCREEN). Có chữ ký → SIGNED.
  signature: signatureDataUrl.optional().nullable(),
  ackMethod: ackMethodEnum.optional().nullable(),
});

export const acknowledgeHandoverSchema = z.object({
  signature: signatureDataUrl,
});

export const returnAssetSchema = z.object({
  returnedAt: dateInput,
  conditionIn: conditionEnum.optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

const cost = z.coerce.number().min(0).max(1_000_000_000_000);

export const createMaintenanceSchema = z.object({
  startedAt: dateInput,
  description: z.string().min(1).max(1000),
  vendor: z.string().max(120).optional().nullable(),
  cost: cost.optional().nullable(),
});

export const completeMaintenanceSchema = z.object({
  completedAt: dateInput,
  description: z.string().min(1).max(1000).optional(),
  vendor: z.string().max(120).optional().nullable(),
  cost: cost.optional().nullable(),
});

export const disposeAssetSchema = z.object({
  status: z.enum(['RETIRED', 'LOST']),
  reason: z.string().min(1).max(500),
  retiredAt: dateInput,
});

export const assetQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  categoryId: z.string().cuid().optional(),
  status: statusEnum.optional(),
  assigneeId: z.string().cuid().optional(),
  sortBy: z.enum(['assetCode', 'name', 'status', 'createdAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

// Export reuses the list filters/sort but never paginates.
export const assetExportQuerySchema = assetQuerySchema.omit({ page: true, limit: true });

export type CreateAssetBody = z.infer<typeof createAssetSchema>;
export type UpdateAssetBody = z.infer<typeof updateAssetSchema>;
export type AssignAssetBody = z.infer<typeof assignAssetSchema>;
export type AcknowledgeHandoverBody = z.infer<typeof acknowledgeHandoverSchema>;
export type ReturnAssetBody = z.infer<typeof returnAssetSchema>;
export type CreateMaintenanceBody = z.infer<typeof createMaintenanceSchema>;
export type CompleteMaintenanceBody = z.infer<typeof completeMaintenanceSchema>;
export type DisposeAssetBody = z.infer<typeof disposeAssetSchema>;
export type AssetQueryInput = z.infer<typeof assetQuerySchema>;
export type AssetExportQueryInput = z.infer<typeof assetExportQuerySchema>;
