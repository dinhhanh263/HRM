import { z } from 'zod';
import { PERMISSION_KEYS } from '@hrm/shared';

const permissionKeySet = new Set<string>(PERMISSION_KEYS);

const permissionsSchema = z
  .array(z.string())
  .refine((keys) => keys.every((k) => permissionKeySet.has(k)), {
    message: 'Contains an unknown permission key',
  });

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  permissions: permissionsSchema,
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  permissions: permissionsSchema.optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
