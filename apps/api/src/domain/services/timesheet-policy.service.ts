import { timesheetPolicyRepository } from '../repositories/timesheet-policy.repository.js';
import { defaultPolicyCreateData } from '../timesheet/defaults.js';
import { toTimesheetPolicyDto } from '../timesheet/mappers.js';
import { BadRequestError } from '../../shared/errors/index.js';
import type { TimesheetPolicyDto } from '@hrm/shared';

export interface UpdateTimesheetPolicyInput {
  workdays?: number[];
  standardHoursPerDay?: number;
  nightStart?: string;
  nightEnd?: string;
  otWeekday?: number;
  otWeekend?: number;
  otHoliday?: number;
  nightExtra?: number;
  nightOtExtra?: number;
}

// OT multipliers must be >= 1.0 (overtime is never paid below the base rate);
// night premiums are additive surcharges so >= 0. Validated here (not just in
// the Zod schema) because these numbers feed payroll and must hold at the
// domain boundary regardless of caller.
function validatePolicyInput(input: UpdateTimesheetPolicyInput): void {
  const otFields: [keyof UpdateTimesheetPolicyInput, number | undefined][] = [
    ['otWeekday', input.otWeekday],
    ['otWeekend', input.otWeekend],
    ['otHoliday', input.otHoliday],
  ];
  for (const [name, value] of otFields) {
    if (value !== undefined && value < 1) {
      throw new BadRequestError(`${name} must be at least 1.0`);
    }
  }

  const nightFields: [keyof UpdateTimesheetPolicyInput, number | undefined][] = [
    ['nightExtra', input.nightExtra],
    ['nightOtExtra', input.nightOtExtra],
  ];
  for (const [name, value] of nightFields) {
    if (value !== undefined && value < 0) {
      throw new BadRequestError(`${name} must be at least 0`);
    }
  }

  if (input.standardHoursPerDay !== undefined && (input.standardHoursPerDay <= 0 || input.standardHoursPerDay > 24)) {
    throw new BadRequestError('standardHoursPerDay must be between 0 and 24');
  }

  if (input.workdays !== undefined) {
    const valid = input.workdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) {
      throw new BadRequestError('workdays must be integers between 0 (Sunday) and 6 (Saturday)');
    }
    if (new Set(input.workdays).size !== input.workdays.length) {
      throw new BadRequestError('workdays must not contain duplicates');
    }
  }
}

export const timesheetPolicyService = {
  /** Returns the tenant policy, auto-seeding VN defaults on first access. */
  async getPolicy(tenantId: string): Promise<TimesheetPolicyDto> {
    const existing = await timesheetPolicyRepository.findByTenant(tenantId);
    if (existing) {
      return toTimesheetPolicyDto(existing);
    }
    const created = await timesheetPolicyRepository.create(defaultPolicyCreateData(tenantId));
    return toTimesheetPolicyDto(created);
  },

  async updatePolicy(tenantId: string, input: UpdateTimesheetPolicyInput): Promise<TimesheetPolicyDto> {
    validatePolicyInput(input);

    // Ensure a row exists before updating (first edit may precede first read).
    const existing = await timesheetPolicyRepository.findByTenant(tenantId);
    if (!existing) {
      await timesheetPolicyRepository.create(defaultPolicyCreateData(tenantId));
    }

    const updated = await timesheetPolicyRepository.update(tenantId, {
      workdays: input.workdays,
      standardHoursPerDay: input.standardHoursPerDay,
      nightStart: input.nightStart,
      nightEnd: input.nightEnd,
      otWeekday: input.otWeekday,
      otWeekend: input.otWeekend,
      otHoliday: input.otHoliday,
      nightExtra: input.nightExtra,
      nightOtExtra: input.nightOtExtra,
    });

    return toTimesheetPolicyDto(updated);
  },
};
