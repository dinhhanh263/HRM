import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Tên mẫu là bắt buộc').max(120),
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(10000),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().min(1).max(255),
    body: z.string().trim().min(1).max(10000),
    isActive: z.boolean(),
  })
  .partial();

export const sendEmailSchema = z
  .object({
    customerId: z.string().cuid(),
    dealId: z.string().cuid().optional().nullable(),
    templateId: z.string().cuid().optional().nullable(),
    subject: z.string().trim().max(255).optional(),
    body: z.string().trim().max(10000).optional(),
  })
  .refine((d) => Boolean(d.templateId) || (Boolean(d.subject) && Boolean(d.body)), {
    message: 'Cần chọn mẫu hoặc nhập tiêu đề + nội dung',
    path: ['subject'],
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
