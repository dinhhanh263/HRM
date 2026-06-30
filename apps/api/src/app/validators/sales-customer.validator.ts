import { z } from 'zod';
import { CustomerType, LeadSource, CustomerLifecycle } from '@prisma/client';

// Profile fields shared by create + update (owner & lifecycle have dedicated
// endpoints — Task 1.2 assign / Task 1.3 lifecycle — so they are NOT editable here).
const profileShape = {
  type: z.nativeEnum(CustomerType),
  fullName: z.string().trim().min(1, 'Tên khách hàng là bắt buộc').max(200),
  title: z.string().trim().max(120).optional(),
  email: z.string().trim().email('Email không hợp lệ').max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  companyId: z.string().cuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
};

export const createCustomerSchema = z.object(profileShape);

export const updateCustomerSchema = z.object(profileShape).partial();

const SORTABLE = ['createdAt', 'fullName', 'lifecycleStatus'] as const;

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  type: z.nativeEnum(CustomerType).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  lifecycleStatus: z.string().trim().optional(),
  ownerId: z.string().optional(), // 'pool' = Lead Pool (ownerId null); cuid = specific owner
  companyId: z.string().cuid().optional(),
  sortBy: z.enum(SORTABLE).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ownerId null = về Lead Pool; cuid = gán cho nhân viên cụ thể.
export const assignOwnerSchema = z.object({
  ownerId: z.string().cuid().nullable(),
});

export const bulkAssignSchema = z.object({
  customerIds: z.array(z.string().cuid()).min(1, 'Chọn ít nhất 1 khách hàng').max(200),
  ownerId: z.string().cuid().nullable(),
});

// Đổi vòng đời lead. DISQUALIFIED bắt buộc kèm lý do (lostReason).
export const changeLifecycleSchema = z
  .object({
    lifecycleStatus: z.nativeEnum(CustomerLifecycle),
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.lifecycleStatus !== CustomerLifecycle.DISQUALIFIED || !!d.lostReason, {
    message: 'Cần nhập lý do khi loại khách hàng',
    path: ['lostReason'],
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersInput = z.infer<typeof listCustomersQuerySchema>;
export type AssignOwnerInput = z.infer<typeof assignOwnerSchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type ChangeLifecycleInput = z.infer<typeof changeLifecycleSchema>;
