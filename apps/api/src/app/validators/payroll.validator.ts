import { z } from 'zod';

// Money is carried as a whole-VND string on the wire. Accept an integer-like
// string and let the service enforce the domain rules (non-negative, finite).
const moneyString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative number');

const taxBracketSchema = z.object({
  upTo: z.number().positive().nullable(),
  rate: z.number().min(0).max(1),
});

export const updatePayrollSettingsSchema = z
  .object({
    currency: z.string().trim().min(1).max(8).optional(),
    payDay: z.number().int().min(1).max(31).optional(),
    socialInsuranceRate: z.number().min(0).max(1).optional(),
    healthInsuranceRate: z.number().min(0).max(1).optional(),
    unemploymentInsuranceRate: z.number().min(0).max(1).optional(),
    unionFeeRate: z.number().min(0).max(1).optional(),
    insuranceBase: z.enum(['GROSS', 'BASE_SALARY']).optional(),
    insuranceCap: moneyString.nullable().optional(),
    personalDeduction: moneyString.optional(),
    dependentDeduction: moneyString.optional(),
    taxBrackets: z.array(taxBracketSchema).min(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

// ---- Employee salary ----

const allowanceSchema = z.object({
  name: z.string().trim().min(1, 'Allowance name is required').max(80),
  amount: z.number().nonnegative('Allowance amount must be non-negative'),
  taxable: z.boolean(),
});

export const createEmployeeSalarySchema = z.object({
  employeeId: z.string().min(1),
  baseSalary: moneyString,
  allowances: z.array(allowanceSchema).max(20).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD'),
  note: z.string().trim().max(500).optional(),
});

// ---- Payroll run ----

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be in YYYY-MM format');

export const createPayrollRunSchema = z.object({
  period,
});

export const listPayrollRunsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED']).optional(),
  period: period.optional(),
});

export const listPayslipsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  period: period.optional(),
});
