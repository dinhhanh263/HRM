import { z } from 'zod';

// SPEC-037 — strict whitelist: a user may self-edit ONLY phone and avatar.
// Everything else on the employee record is HR's job.
export const updateMyProfileSchema = z
  .object({
    phone: z.string().max(30),
    avatar: z.string().url('Avatar must be a URL').max(500).or(z.literal('')),
  })
  .partial()
  .strict();

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

// SPEC-037 P3 — email prefs per reminder kind. Strict: unknown kinds rejected.
export const updateNotificationPrefsSchema = z
  .object({
    probation_ending: z.boolean(),
    contract_expiring: z.boolean(),
  })
  .partial()
  .strict();

export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;
