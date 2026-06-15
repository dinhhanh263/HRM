import { z } from 'zod';

// `<input type="date">` posts "YYYY-MM-DD"; API clients/seeds may post full ISO.
const dateInput = z.union([z.string().datetime(), z.string().date()]);
const contractTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION']);
const statusEnum = z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED']);

export const createContractSchema = z.object({
  type: contractTypeEnum,
  startDate: dateInput,
  endDate: dateInput.optional().nullable(),
  status: statusEnum.optional(),
  signedAt: dateInput.optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const updateContractSchema = z.object({
  type: contractTypeEnum.optional(),
  startDate: dateInput.optional(),
  endDate: dateInput.optional().nullable(),
  status: statusEnum.optional(),
  signedAt: dateInput.optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const endContractSchema = z.object({
  endDate: dateInput,
  status: z.enum(['EXPIRED', 'TERMINATED']).optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type EndContractInput = z.infer<typeof endContractSchema>;
