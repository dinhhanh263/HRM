import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('validation.emailInvalid'),
  password: z
    .string()
    .min(8, 'validation.passwordMin')
    .regex(/[A-Z]/, 'validation.passwordUpper')
    .regex(/[a-z]/, 'validation.passwordLower')
    .regex(/[0-9]/, 'validation.passwordDigit'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'validation.fullNameMin'),
  tenantSlug: z.string().min(1, 'validation.tenantRequired'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'validation.passwordMismatch',
  path: ['confirmPassword'],
});

export type RegisterFormData = z.infer<typeof registerSchema>;
