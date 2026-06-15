import type { Prisma } from '@prisma/client';

// Sane Vietnam defaults for a tenant's timesheet/overtime policy, auto-seeded on
// first read. Every value is editable via the policy config UI because it feeds
// payroll multipliers and differs by company. Multipliers follow Điều 98 BLLĐ
// 2019 minimums (weekday ≥150%, weekend ≥200%, holiday ≥300%, night +30%,
// night-OT +20%). workdays use the JS getDay convention: 0=Sun .. 6=Sat.
export const DEFAULT_TIMESHEET_POLICY = {
  workdays: [1, 2, 3, 4, 5],
  standardHoursPerDay: 8,
  nightStart: '22:00',
  nightEnd: '06:00',
  otWeekday: 1.5,
  otWeekend: 2.0,
  otHoliday: 3.0,
  nightExtra: 0.3,
  nightOtExtra: 0.2,
} as const;

/** The create-input for a tenant's default policy (used by service auto-seed and prisma seed). */
export function defaultPolicyCreateData(tenantId: string): Prisma.TimesheetPolicyCreateInput {
  return {
    tenant: { connect: { id: tenantId } },
    ...DEFAULT_TIMESHEET_POLICY,
    workdays: [...DEFAULT_TIMESHEET_POLICY.workdays],
  };
}
