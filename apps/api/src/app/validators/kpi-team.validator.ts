import { z } from 'zod';

export const upsertTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().min(1).nullish(),
  leadId: z.string().min(1).nullish(),
  memberIds: z.array(z.string().min(1)).optional(),
});
