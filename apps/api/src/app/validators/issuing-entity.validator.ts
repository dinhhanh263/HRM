import { z } from 'zod';

// SPEC-043: validate issuing-entity create/update payloads. `name` required on
// create; max lengths mirror settings.company (name 200 / address 500 / taxCode
// 50 / phone 30). Blank strings normalised to null in the service.
export const createIssuingEntitySchema = z.object({
  name: z.string().trim().min(1, 'Tên pháp nhân là bắt buộc').max(200),
  address: z.string().max(500).optional().nullable(),
  taxCode: z.string().max(50).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const updateIssuingEntitySchema = z
  .object({
    name: z.string().trim().min(1, 'Tên pháp nhân là bắt buộc').max(200),
    address: z.string().max(500).nullable(),
    taxCode: z.string().max(50).nullable(),
    phone: z.string().max(30).nullable(),
    isDefault: z.boolean(),
    active: z.boolean(),
  })
  .partial();

export const issuingEntityListQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
});

export type CreateIssuingEntityInput = z.infer<typeof createIssuingEntitySchema>;
export type UpdateIssuingEntityInput = z.infer<typeof updateIssuingEntitySchema>;
