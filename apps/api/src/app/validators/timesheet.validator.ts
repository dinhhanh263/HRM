import { z } from 'zod';

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format');

// ---- Timesheet policy ----

export const updateTimesheetPolicySchema = z
  .object({
    workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    standardHoursPerDay: z.number().positive().max(24).optional(),
    nightStart: timeOfDay.optional(),
    nightEnd: timeOfDay.optional(),
    otWeekday: z.number().min(1).max(10).optional(),
    otWeekend: z.number().min(1).max(10).optional(),
    otHoliday: z.number().min(1).max(10).optional(),
    nightExtra: z.number().min(0).max(10).optional(),
    nightOtExtra: z.number().min(0).max(10).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

// ---- Holidays ----

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const createHolidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(1, 'Name is required').max(120),
  recurring: z.boolean().optional(),
});

export const updateHolidaySchema = z
  .object({
    date: isoDate.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    recurring: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const seedHolidaysSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

// ---- Attendance ----

export const checkInSchema = z.object({
  note: z.string().trim().max(500).optional(),
  workDate: isoDate.optional(),
});

export const checkOutSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const isoDateTime = z
  .string()
  .datetime({ message: 'Timestamp must be a valid ISO-8601 datetime' });

export const adjustAttendanceSchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  workDate: isoDate,
  checkInAt: isoDateTime.nullish(),
  checkOutAt: isoDateTime.nullish(),
  note: z.string().trim().max(500).optional(),
});

// ---- Overtime ----

export const createOvertimeSchema = z.object({
  workDate: isoDate,
  hours: z.number().positive('hours must be greater than 0').max(12, 'hours cannot exceed 12'),
  night: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const rejectOvertimeSchema = z.object({
  note: z.string().trim().min(1, 'A rejection note is required').max(500),
});
