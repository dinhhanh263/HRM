import type { AllowanceItem, InsuranceBase, OvertimeCategory, TaxBracket } from '@hrm/shared';

// The pure pay-calculation engine. Deterministic and side-effect-free: given a
// salary, the snapshotted attendance summary, tenant settings and dependents, it
// returns every intermediate figure of the payslip. Money is whole-VND numbers
// in and out — the run service converts to/from the string-money DTOs. No I/O,
// no Date.now, no statutory constants baked in (rates/brackets are all inputs).

const round = (n: number): number => Math.round(n);

export interface PayslipEngineSettings {
  socialInsuranceRate: number;
  healthInsuranceRate: number;
  unemploymentInsuranceRate: number;
  unionFeeRate: number; // Phí công đoàn — same base as insurance, deducted post-tax
  insuranceBase: InsuranceBase;
  insuranceCap: number | null;
  personalDeduction: number;
  dependentDeduction: number;
  taxBrackets: TaxBracket[];
}

export interface PayslipEngineOvertime {
  category: OvertimeCategory;
  night: boolean;
  hours: number;
  multiplier: number; // snapshotted at OT approval — never recomputed here
}

export interface PayslipEngineAttendance {
  workingDaysInPeriod: number; // policy workdays in the month, excluding holidays
  daysPresent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  daysAbsent: number;
  holidayCount: number;
  overtime: PayslipEngineOvertime[];
}

export interface PayslipEngineInput {
  baseSalary: number;
  allowances: AllowanceItem[];
  dependents: number;
  standardHoursPerDay: number;
  otherDeductions?: number;
  attendance: PayslipEngineAttendance;
  settings: PayslipEngineSettings;
}

export interface PayslipOvertimeLine {
  category: OvertimeCategory;
  night: boolean;
  hours: number;
  multiplier: number;
  amount: number;
}

export interface PayslipBreakdown {
  proratedBase: number;
  allowanceTotal: number;
  otPay: number;
  overtime: PayslipOvertimeLine[];
  grossPay: number;
  socialInsurance: number;
  healthInsurance: number;
  unemploymentInsurance: number;
  insuranceTotal: number;
  taxableIncome: number;
  personalIncomeTax: number;
  unionFee: number; // Phí công đoàn — post-tax deduction, reduces net pay only
  otherDeductions: number;
  netPay: number;
}

/**
 * Progressive ("marginal, per-bracket") personal income tax over the configured
 * brackets. Each `upTo` is the upper bound of taxable income for that bracket;
 * the slice taxed at a bracket's rate is the portion of income falling between
 * the previous bound and this one. A null `upTo` is the open-ended top bracket.
 * Returns whole VND (rounded once at the end). Zero for non-positive income.
 */
export function progressivePit(taxableIncome: number, brackets: TaxBracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.upTo ?? Infinity;
    const slice = Math.min(taxableIncome, upper) - lower;
    if (slice > 0) tax += slice * bracket.rate;
    if (taxableIncome <= upper) break;
    lower = upper;
  }
  return round(tax);
}

/** Compute the full payslip breakdown. See module header for the contract. */
export function computePayslip(input: PayslipEngineInput): PayslipBreakdown {
  const { baseSalary, allowances, dependents, standardHoursPerDay, attendance, settings } = input;
  const {
    workingDaysInPeriod,
    unpaidLeaveDays,
    daysAbsent,
    overtime,
  } = attendance;

  // Prorated base: present + paid leave + holidays are paid; unpaid leave and
  // absence are deducted. Guard against a zero-working-day month.
  const paidRatio =
    workingDaysInPeriod > 0
      ? Math.max(0, workingDaysInPeriod - unpaidLeaveDays - daysAbsent) / workingDaysInPeriod
      : 0;
  const proratedBase = round(baseSalary * paidRatio);

  const allowanceTotal = allowances.reduce((sum, a) => sum + a.amount, 0);

  // OT pay from the hourly rate derived off the *contractual* base and the
  // snapshotted multipliers. Each line is rounded to whole VND so the per-line
  // amounts persisted on the payslip sum exactly to otPay.
  const hourlyRate =
    workingDaysInPeriod > 0 && standardHoursPerDay > 0
      ? baseSalary / (workingDaysInPeriod * standardHoursPerDay)
      : 0;
  const overtimeLines: PayslipOvertimeLine[] = overtime.map((ot) => ({
    category: ot.category,
    night: ot.night,
    hours: ot.hours,
    multiplier: ot.multiplier,
    amount: round(hourlyRate * ot.hours * ot.multiplier),
  }));
  const otPay = overtimeLines.reduce((sum, l) => sum + l.amount, 0);

  const grossPay = proratedBase + allowanceTotal + otPay;

  // Insurance: employee-side rates on the configured base (BASE_SALARY uses the
  // contractual base, not the prorated figure), capped if a ceiling is set.
  const rawInsuranceBase = settings.insuranceBase === 'GROSS' ? grossPay : baseSalary;
  const insuranceBaseAmount =
    settings.insuranceCap != null
      ? Math.min(rawInsuranceBase, settings.insuranceCap)
      : rawInsuranceBase;
  const socialInsurance = round(insuranceBaseAmount * settings.socialInsuranceRate);
  const healthInsurance = round(insuranceBaseAmount * settings.healthInsuranceRate);
  const unemploymentInsurance = round(insuranceBaseAmount * settings.unemploymentInsuranceRate);
  const insuranceTotal = socialInsurance + healthInsurance + unemploymentInsurance;

  // Taxable income: exclude insurance, personal + dependent deductions and any
  // non-taxable allowances; floor at 0.
  const nonTaxableAllowances = allowances
    .filter((a) => !a.taxable)
    .reduce((sum, a) => sum + a.amount, 0);
  const taxableIncome = Math.max(
    0,
    grossPay -
      insuranceTotal -
      settings.personalDeduction -
      settings.dependentDeduction * dependents -
      nonTaxableAllowances,
  );

  const personalIncomeTax = progressivePit(taxableIncome, settings.taxBrackets);

  // Union fee (phí công đoàn): same capped base as insurance, but a POST-tax
  // deduction — it reduces net pay only and never the taxable income above.
  const unionFee = round(insuranceBaseAmount * settings.unionFeeRate);

  const otherDeductions = input.otherDeductions ?? 0;
  const netPay = grossPay - insuranceTotal - personalIncomeTax - unionFee - otherDeductions;

  return {
    proratedBase,
    allowanceTotal,
    otPay,
    overtime: overtimeLines,
    grossPay,
    socialInsurance,
    healthInsurance,
    unemploymentInsurance,
    insuranceTotal,
    taxableIncome,
    personalIncomeTax,
    unionFee,
    otherDeductions,
    netPay,
  };
}
