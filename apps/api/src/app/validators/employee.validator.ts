import { z } from 'zod';

// `<input type="date">` posts a date-only string ("YYYY-MM-DD"); API clients and
// seeds may post a full ISO datetime. Accept both — the service normalises via new Date().
const dateInput = z.union([z.string().datetime(), z.string().date()]);

// Avatars are stored inline as a base64 image data URL (no object storage); we
// also accept a plain http(s) URL. Bounded to ~5MB of characters to cap the body.
const AVATAR_MAX_CHARS = 5_000_000;
const avatarInput = z
  .string()
  .max(AVATAR_MAX_CHARS, 'Avatar image is too large')
  .refine(
    (v) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) || /^https?:\/\//.test(v),
    'Avatar must be an image data URL or http(s) URL',
  );

const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);
const contractTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION']);
const roleEnum = z.enum(['EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'PAYROLL_APPROVER']);
const statusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);

export const createEmployeeSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  dateOfBirth: dateInput.optional(),
  gender: genderEnum.optional(),
  idNumber: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email address'),
  departmentId: z.string().cuid().optional(),
  positionId: z.string().cuid().optional(),
  managerId: z.string().cuid().optional(),
  joinDate: dateInput.optional(),
  probationEndDate: dateInput.optional(),
  contractType: contractTypeEnum.optional(),
  dependentsCount: z.coerce.number().int().min(0).max(20).optional(),
  avatarUrl: avatarInput.optional(),
  role: roleEnum.optional(),
  roleId: z.string().cuid().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  dateOfBirth: dateInput.optional(),
  gender: genderEnum.optional(),
  idNumber: z.string().max(20).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  departmentId: z.string().cuid().optional().nullable(),
  positionId: z.string().cuid().optional().nullable(),
  managerId: z.string().cuid().optional().nullable(),
  joinDate: dateInput.optional(),
  probationEndDate: dateInput.optional().nullable(),
  contractType: contractTypeEnum.optional(),
  dependentsCount: z.coerce.number().int().min(0).max(20).optional(),
  avatarUrl: avatarInput.optional().nullable(),
  role: roleEnum.optional(),
  roleId: z.string().cuid().optional(),
});

export const employeeQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  departmentId: z.string().cuid().optional(),
  positionId: z.string().cuid().optional(),
  status: statusEnum.optional(),
  contractType: contractTypeEnum.optional(),
  minLevel: z.coerce.number().int().positive().optional(),
  sort: z.enum(['fullName', 'joinDate', 'employeeCode']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeQueryInput = z.infer<typeof employeeQuerySchema>;
