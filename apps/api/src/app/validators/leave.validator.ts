import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#([0-9A-Fa-f]{6})$/, 'Color must be a 6-digit hex value like #3B82F6');

// ---- Leave types ----

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(30)
    .regex(/^[A-Za-z0-9_]+$/, 'Code may only contain letters, numbers and underscores'),
  colorHex: hexColor.optional().nullable(),
  defaultDays: z.number().min(0).max(365).optional(),
  paid: z.boolean().optional(),
  requiresAttachment: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateLeaveTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  colorHex: hexColor.optional().nullable(),
  defaultDays: z.number().min(0).max(365).optional(),
  paid: z.boolean().optional(),
  requiresAttachment: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const leaveTypeQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
});

// ---- Leave requests ----

const leaveStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RETURNED']);

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: z.string().cuid(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    halfDay: z.boolean().optional(),
    reason: z.string().max(1000).optional(),
    attachmentUrl: z.string().url().optional(),
  })
  .refine((d) => new Date(d.startDate) <= new Date(d.endDate), {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })
  .refine((d) => !d.halfDay || d.startDate === d.endDate, {
    message: 'Half-day leave is only allowed for a single day',
    path: ['halfDay'],
  });

export const rejectLeaveRequestSchema = z.object({
  note: z.string().max(1000).optional(),
});

// ---- Approval flows ----

const approverTypeEnum = z.enum(['MANAGER', 'DEPARTMENT_HEAD', 'ROLE', 'SPECIFIC_USER']);

const approvalStepSchema = z
  .object({
    approverType: approverTypeEnum,
    roleKey: z.string().min(1).max(50).optional().nullable(),
    approverId: z.string().cuid().optional().nullable(),
  })
  .superRefine((step, ctx) => {
    if (step.approverType === 'ROLE' && !step.roleKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'roleKey is required when approverType is ROLE',
        path: ['roleKey'],
      });
    }
    if (step.approverType === 'SPECIFIC_USER' && !step.approverId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'approverId is required when approverType is SPECIFIC_USER',
        path: ['approverId'],
      });
    }
  });

export const createApprovalFlowSchema = z.object({
  departmentId: z.string().cuid().optional().nullable(),
  name: z.string().min(1, 'Name is required').max(100),
  active: z.boolean().optional(),
  steps: z.array(approvalStepSchema).min(1, 'At least one step is required'),
});

export const updateApprovalFlowSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    active: z.boolean().optional(),
    // When present, replaces the flow's entire step list.
    steps: z.array(approvalStepSchema).min(1, 'At least one step is required').optional(),
  })
  .refine((d) => d.name !== undefined || d.active !== undefined || d.steps !== undefined, {
    message: 'Provide at least one field to update',
  });

export const replaceApprovalStepsSchema = z.object({
  steps: z.array(approvalStepSchema).min(1, 'At least one step is required'),
});

export const leaveRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  scope: z.enum(['mine', 'review', 'all']).optional(),
  status: leaveStatusEnum.optional(),
  leaveTypeId: z.string().cuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  search: z.string().optional(),
});

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employeeId: z.string().cuid().optional(),
});

// Company-wide / team leave balance roster (HR + Manager overview).
export const leaveRosterQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  departmentId: z.string().cuid().optional(),
  search: z.string().trim().min(1).optional(),
});

// Excel export of the roster: same filters as the roster, but no pagination —
// the controller streams every matching (active, in-scope) employee.
export const leaveRosterExportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  departmentId: z.string().cuid().optional(),
  search: z.string().trim().min(1).optional(),
});

// HR sets a per-employee allocation override for one leave type in one year.
export const setLeaveBalanceSchema = z.object({
  employeeId: z.string().cuid(),
  leaveTypeId: z.string().cuid(),
  year: z.number().int().min(2000).max(2100),
  allocated: z.number().min(0).max(365),
});

// ---- Leave settings (tenant-level toggle) ----

export const updateLeaveSettingsSchema = z.object({
  proRataEnabled: z.boolean(),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type LeaveRequestQueryInput = z.infer<typeof leaveRequestQuerySchema>;
export type LeaveRosterQueryInput = z.infer<typeof leaveRosterQuerySchema>;
export type LeaveRosterExportQueryInput = z.infer<typeof leaveRosterExportQuerySchema>;
export type SetLeaveBalanceInput = z.infer<typeof setLeaveBalanceSchema>;
