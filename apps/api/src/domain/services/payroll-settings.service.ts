import type { Prisma } from '@prisma/client';
import { payrollSettingsRepository } from '../repositories/payroll-settings.repository.js';
import { defaultPayrollSettingsCreateData } from '../payroll/defaults.js';
import { toPayrollSettingsDto } from '../payroll/mappers.js';
import { BadRequestError } from '../../shared/errors/index.js';
import type { PayrollSettingsDto, TaxBracket, InsuranceBase, UpdatePayrollSettingsRequest } from '@hrm/shared';

export type UpdatePayrollSettingsInput = UpdatePayrollSettingsRequest;

// A VND money string must parse to a finite, non-negative whole number.
function parseMoney(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestError(`${name} must be a non-negative amount`);
  }
  return n;
}

// Insurance rates are employee-side fractions (e.g. 0.08 = 8%). They must sit in
// [0, 1]. Validated at the domain boundary because they feed payroll directly.
function validateRate(name: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestError(`${name} must be a fraction between 0 and 1`);
  }
}

// The PIT table must be non-empty, every rate in [0, 1], `upTo` strictly
// ascending, and exactly the final bracket open-ended (upTo === null). A broken
// table would silently mis-tax everyone, so it is rejected at the boundary.
function validateTaxBrackets(brackets: TaxBracket[]): void {
  if (!Array.isArray(brackets) || brackets.length === 0) {
    throw new BadRequestError('taxBrackets must contain at least one bracket');
  }

  let prevUpTo = 0;
  brackets.forEach((b, i) => {
    const isLast = i === brackets.length - 1;

    if (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1) {
      throw new BadRequestError('each tax bracket rate must be a fraction between 0 and 1');
    }

    if (isLast) {
      if (b.upTo !== null) {
        throw new BadRequestError('the final tax bracket must be open-ended (upTo: null)');
      }
      return;
    }

    if (b.upTo === null) {
      throw new BadRequestError('only the final tax bracket may be open-ended (upTo: null)');
    }
    if (!Number.isFinite(b.upTo) || b.upTo <= prevUpTo) {
      throw new BadRequestError('tax bracket upTo bounds must strictly increase');
    }
    prevUpTo = b.upTo;
  });
}

function validateInput(input: UpdatePayrollSettingsInput): void {
  validateRate('socialInsuranceRate', input.socialInsuranceRate);
  validateRate('healthInsuranceRate', input.healthInsuranceRate);
  validateRate('unemploymentInsuranceRate', input.unemploymentInsuranceRate);
  validateRate('unionFeeRate', input.unionFeeRate);

  if (input.payDay !== undefined && (!Number.isInteger(input.payDay) || input.payDay < 1 || input.payDay > 31)) {
    throw new BadRequestError('payDay must be a day-of-month between 1 and 31');
  }

  if (input.insuranceBase !== undefined && input.insuranceBase !== 'GROSS' && input.insuranceBase !== 'BASE_SALARY') {
    throw new BadRequestError('insuranceBase must be GROSS or BASE_SALARY');
  }

  if (input.personalDeduction !== undefined) {
    parseMoney('personalDeduction', input.personalDeduction);
  }
  if (input.dependentDeduction !== undefined) {
    parseMoney('dependentDeduction', input.dependentDeduction);
  }
  if (input.insuranceCap !== undefined && input.insuranceCap !== null) {
    parseMoney('insuranceCap', input.insuranceCap);
  }

  if (input.taxBrackets !== undefined) {
    validateTaxBrackets(input.taxBrackets);
  }
}

function toUpdateData(input: UpdatePayrollSettingsInput): Prisma.PayrollSettingsUpdateInput {
  return {
    currency: input.currency,
    payDay: input.payDay,
    socialInsuranceRate: input.socialInsuranceRate,
    healthInsuranceRate: input.healthInsuranceRate,
    unemploymentInsuranceRate: input.unemploymentInsuranceRate,
    unionFeeRate: input.unionFeeRate,
    insuranceBase: input.insuranceBase as InsuranceBase | undefined,
    insuranceCap: input.insuranceCap,
    personalDeduction: input.personalDeduction,
    dependentDeduction: input.dependentDeduction,
    taxBrackets: input.taxBrackets as unknown as Prisma.InputJsonValue | undefined,
  };
}

export const payrollSettingsService = {
  /** Returns the tenant payroll settings, auto-seeding VN defaults on first access. */
  async getSettings(tenantId: string): Promise<PayrollSettingsDto> {
    const existing = await payrollSettingsRepository.findByTenant(tenantId);
    if (existing) {
      return toPayrollSettingsDto(existing);
    }
    const created = await payrollSettingsRepository.create(defaultPayrollSettingsCreateData(tenantId));
    return toPayrollSettingsDto(created);
  },

  async updateSettings(tenantId: string, input: UpdatePayrollSettingsInput): Promise<PayrollSettingsDto> {
    validateInput(input);

    // Ensure a row exists before updating (first edit may precede first read).
    const existing = await payrollSettingsRepository.findByTenant(tenantId);
    if (!existing) {
      await payrollSettingsRepository.create(defaultPayrollSettingsCreateData(tenantId));
    }

    const updated = await payrollSettingsRepository.update(tenantId, toUpdateData(input));
    return toPayrollSettingsDto(updated);
  },
};
