import type { Prisma } from '@prisma/client';
import type { TaxBracket } from '@hrm/shared';

// The 7-step progressive PIT table for monthly taxable income (Biểu thuế lũy
// tiến từng phần, TT 111/2013). `upTo` is the upper bound of *taxable income*
// in VND for the bracket; null = the open-ended top bracket. Rates are marginal
// fractions, ordered ascending. Seeded as a tenant default (editable in the UI)
// — never hardcoded inside the calculation engine.
export const DEFAULT_TAX_BRACKETS: TaxBracket[] = [
  { upTo: 5_000_000, rate: 0.05 },
  { upTo: 10_000_000, rate: 0.1 },
  { upTo: 18_000_000, rate: 0.15 },
  { upTo: 32_000_000, rate: 0.2 },
  { upTo: 52_000_000, rate: 0.25 },
  { upTo: 80_000_000, rate: 0.3 },
  { upTo: null, rate: 0.35 },
];

// Sane Vietnam defaults for a tenant's payroll config, auto-seeded on first
// read. Employee-side insurance rates follow the statutory split (BHXH 8% +
// BHYT 1.5% + BHTN 1%); personal/dependent deductions follow Nghị quyết
// 954/2020 (11M / 4.4M VND). Every value is editable via the settings UI.
export const DEFAULT_PAYROLL_SETTINGS = {
  currency: 'VND',
  payDay: 5,
  socialInsuranceRate: 0.08,
  healthInsuranceRate: 0.015,
  unemploymentInsuranceRate: 0.01,
  // Đoàn phí công đoàn defaults to 0 — opt-in per tenant (backward-compatible).
  unionFeeRate: 0,
  insuranceBase: 'BASE_SALARY',
  insuranceCap: null,
  personalDeduction: '11000000',
  dependentDeduction: '4400000',
} as const;

/** The create-input for a tenant's default payroll settings (service auto-seed + prisma seed). */
export function defaultPayrollSettingsCreateData(
  tenantId: string,
): Prisma.PayrollSettingsCreateInput {
  return {
    tenant: { connect: { id: tenantId } },
    currency: DEFAULT_PAYROLL_SETTINGS.currency,
    payDay: DEFAULT_PAYROLL_SETTINGS.payDay,
    socialInsuranceRate: DEFAULT_PAYROLL_SETTINGS.socialInsuranceRate,
    healthInsuranceRate: DEFAULT_PAYROLL_SETTINGS.healthInsuranceRate,
    unemploymentInsuranceRate: DEFAULT_PAYROLL_SETTINGS.unemploymentInsuranceRate,
    unionFeeRate: DEFAULT_PAYROLL_SETTINGS.unionFeeRate,
    insuranceBase: DEFAULT_PAYROLL_SETTINGS.insuranceBase,
    insuranceCap: DEFAULT_PAYROLL_SETTINGS.insuranceCap,
    personalDeduction: DEFAULT_PAYROLL_SETTINGS.personalDeduction,
    dependentDeduction: DEFAULT_PAYROLL_SETTINGS.dependentDeduction,
    taxBrackets: DEFAULT_TAX_BRACKETS as unknown as Prisma.InputJsonValue,
  };
}
