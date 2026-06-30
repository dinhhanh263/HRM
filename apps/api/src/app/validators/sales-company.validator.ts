import { z } from 'zod';

const shape = {
  name: z.string().trim().min(1, 'Tên công ty là bắt buộc').max(200),
  taxCode: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(120).optional(),
  size: z.string().trim().max(60).optional(),
  website: z.string().trim().max(255).optional(),
  address: z.string().trim().max(500).optional(),
};

export const createCompanySchema = z.object(shape);
export const updateCompanySchema = z.object(shape).partial();

export const listCompaniesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesInput = z.infer<typeof listCompaniesQuerySchema>;
