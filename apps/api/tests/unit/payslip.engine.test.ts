import { describe, it, expect } from 'vitest';
import {
  computePayslip,
  progressivePit,
  type PayslipEngineInput,
  type PayslipEngineSettings,
} from '../../src/domain/payroll/payslip.engine.js';
import { DEFAULT_TAX_BRACKETS } from '../../src/domain/payroll/defaults.js';

// Mirrors the seeded VN payroll defaults, as numbers (the engine is numeric;
// string↔number conversion lives in the run service, not here).
const SETTINGS: PayslipEngineSettings = {
  socialInsuranceRate: 0.08,
  healthInsuranceRate: 0.015,
  unemploymentInsuranceRate: 0.01,
  unionFeeRate: 0,
  insuranceBase: 'BASE_SALARY',
  insuranceCap: null,
  personalDeduction: 11_000_000,
  dependentDeduction: 4_400_000,
  taxBrackets: DEFAULT_TAX_BRACKETS,
};

// A clean full-month input: 30M base, 20 workdays × 8h, one taxable + one
// non-taxable allowance, one dependent, no OT, no leave/absence.
function fullMonthInput(overrides: Partial<PayslipEngineInput> = {}): PayslipEngineInput {
  return {
    baseSalary: 30_000_000,
    allowances: [
      { name: 'Ăn trưa', amount: 730_000, taxable: true },
      { name: 'Điện thoại', amount: 500_000, taxable: false },
    ],
    dependents: 1,
    standardHoursPerDay: 8,
    attendance: {
      workingDaysInPeriod: 20,
      daysPresent: 20,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      daysAbsent: 0,
      holidayCount: 0,
      overtime: [],
    },
    settings: SETTINGS,
    ...overrides,
  };
}

describe('progressivePit', () => {
  it('should be 0 for zero or negative taxable income', () => {
    expect(progressivePit(0, DEFAULT_TAX_BRACKETS)).toBe(0);
    expect(progressivePit(-100, DEFAULT_TAX_BRACKETS)).toBe(0);
  });

  it('should tax only the first bracket at its upper boundary (5,000,000)', () => {
    // 5,000,000 × 5% = 250,000
    expect(progressivePit(5_000_000, DEFAULT_TAX_BRACKETS)).toBe(250_000);
  });

  it('should add the second bracket marginally just above the first boundary', () => {
    // 5,000,000×5% + 1×10% = 250,000 (rounded from 250,000.1)
    expect(progressivePit(5_000_001, DEFAULT_TAX_BRACKETS)).toBe(250_000);
  });

  it('should tax through the second bracket boundary (10,000,000)', () => {
    // 250,000 + 5,000,000×10% = 750,000
    expect(progressivePit(10_000_000, DEFAULT_TAX_BRACKETS)).toBe(750_000);
  });

  it('should tax through the third bracket boundary (18,000,000)', () => {
    // 750,000 + 8,000,000×15% = 1,950,000
    expect(progressivePit(18_000_000, DEFAULT_TAX_BRACKETS)).toBe(1_950_000);
  });

  it('should tax through the fourth bracket boundary (32,000,000)', () => {
    // 1,950,000 + 14,000,000×20% = 4,750,000
    expect(progressivePit(32_000_000, DEFAULT_TAX_BRACKETS)).toBe(4_750_000);
  });

  it('should tax through the fifth bracket boundary (52,000,000)', () => {
    // 4,750,000 + 20,000,000×25% = 9,750,000
    expect(progressivePit(52_000_000, DEFAULT_TAX_BRACKETS)).toBe(9_750_000);
  });

  it('should tax through the sixth bracket boundary (80,000,000)', () => {
    // 9,750,000 + 28,000,000×30% = 18,150,000
    expect(progressivePit(80_000_000, DEFAULT_TAX_BRACKETS)).toBe(18_150_000);
  });

  it('should tax the open-ended top bracket above 80,000,000 at 35%', () => {
    // 18,150,000 + 20,000,000×35% = 25,150,000
    expect(progressivePit(100_000_000, DEFAULT_TAX_BRACKETS)).toBe(25_150_000);
  });

  it('should tax a mid-bracket value marginally (12,180,000)', () => {
    // 250,000 + 500,000 + 2,180,000×15% = 1,077,000
    expect(progressivePit(12_180_000, DEFAULT_TAX_BRACKETS)).toBe(1_077_000);
  });
});

describe('computePayslip — full month', () => {
  it('should pay the full base when there are no unpaid days or absence', () => {
    const r = computePayslip(fullMonthInput());
    expect(r.proratedBase).toBe(30_000_000);
    expect(r.allowanceTotal).toBe(1_230_000);
    expect(r.otPay).toBe(0);
    expect(r.grossPay).toBe(31_230_000);
  });

  it('should compute employee-side insurance on the base salary', () => {
    const r = computePayslip(fullMonthInput());
    expect(r.socialInsurance).toBe(2_400_000); // 30M × 8%
    expect(r.healthInsurance).toBe(450_000); // 30M × 1.5%
    expect(r.unemploymentInsurance).toBe(300_000); // 30M × 1%
    expect(r.insuranceTotal).toBe(3_150_000);
  });

  it('should exclude non-taxable allowances and deductions from taxable income', () => {
    const r = computePayslip(fullMonthInput());
    // 31,230,000 − 3,150,000 − 11,000,000 − 4,400,000 − 500,000(non-taxable)
    expect(r.taxableIncome).toBe(12_180_000);
    expect(r.personalIncomeTax).toBe(1_077_000);
  });

  it('should assemble net as gross − insurance − PIT − other deductions', () => {
    const r = computePayslip(fullMonthInput());
    expect(r.otherDeductions).toBe(0);
    expect(r.netPay).toBe(27_003_000);
  });
});

describe('computePayslip — proration', () => {
  it('should prorate the base for unpaid leave and absence (paid days / working days)', () => {
    const r = computePayslip(
      fullMonthInput({
        attendance: {
          workingDaysInPeriod: 20,
          daysPresent: 17,
          paidLeaveDays: 0,
          unpaidLeaveDays: 2,
          daysAbsent: 1,
          holidayCount: 0,
          overtime: [],
        },
      }),
    );
    // 30M × (20−2−1)/20 = 25,500,000
    expect(r.proratedBase).toBe(25_500_000);
    expect(r.grossPay).toBe(26_730_000);
    // insurance still on full base salary
    expect(r.insuranceTotal).toBe(3_150_000);
    expect(r.taxableIncome).toBe(7_680_000);
    expect(r.personalIncomeTax).toBe(518_000);
    expect(r.netPay).toBe(23_062_000);
  });

  it('should treat paid leave and holidays as fully paid (no deduction)', () => {
    const r = computePayslip(
      fullMonthInput({
        attendance: {
          workingDaysInPeriod: 20,
          daysPresent: 15,
          paidLeaveDays: 3,
          unpaidLeaveDays: 0,
          daysAbsent: 0,
          holidayCount: 2,
          overtime: [],
        },
      }),
    );
    expect(r.proratedBase).toBe(30_000_000);
  });

  it('should floor the prorated base at 0 when unpaid + absent exceed working days', () => {
    const r = computePayslip(
      fullMonthInput({
        attendance: {
          workingDaysInPeriod: 20,
          daysPresent: 0,
          paidLeaveDays: 0,
          unpaidLeaveDays: 19,
          daysAbsent: 5,
          holidayCount: 0,
          overtime: [],
        },
      }),
    );
    expect(r.proratedBase).toBe(0);
  });

  it('should guard division by zero when there are no working days', () => {
    const r = computePayslip(
      fullMonthInput({
        attendance: {
          workingDaysInPeriod: 0,
          daysPresent: 0,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          daysAbsent: 0,
          holidayCount: 0,
          overtime: [{ category: 'OT_WEEKDAY', night: false, hours: 8, multiplier: 1.5 }],
        },
      }),
    );
    expect(r.proratedBase).toBe(0);
    expect(r.otPay).toBe(0); // hourlyRate is 0 with no working days
    expect(r.grossPay).toBe(1_230_000); // allowances only
  });
});

describe('computePayslip — overtime', () => {
  it('should pay OT as hourlyRate × hours × snapshotted multiplier, rounded per line', () => {
    const r = computePayslip(
      fullMonthInput({
        attendance: {
          workingDaysInPeriod: 20,
          daysPresent: 20,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          daysAbsent: 0,
          holidayCount: 0,
          overtime: [
            { category: 'OT_WEEKDAY', night: false, hours: 10, multiplier: 1.5 },
            { category: 'OT_WEEKEND', night: true, hours: 5, multiplier: 2.7 },
          ],
        },
      }),
    );
    // hourlyRate = 30,000,000 / (20×8) = 187,500
    // line1 = 187,500×10×1.5 = 2,812,500 ; line2 = 187,500×5×2.7 = 2,531,250
    expect(r.overtime).toHaveLength(2);
    expect(r.overtime[0].amount).toBe(2_812_500);
    expect(r.overtime[1].amount).toBe(2_531_250);
    expect(r.otPay).toBe(5_343_750);
    expect(r.grossPay).toBe(36_573_750);
  });
});

describe('computePayslip — insurance base and cap', () => {
  it('should apply insurance on GROSS when configured', () => {
    const r = computePayslip(
      fullMonthInput({
        settings: { ...SETTINGS, insuranceBase: 'GROSS' },
      }),
    );
    // gross 31,230,000 × 8% / 1.5% / 1%
    expect(r.socialInsurance).toBe(2_498_400);
    expect(r.healthInsurance).toBe(468_450);
    expect(r.unemploymentInsurance).toBe(312_300);
    expect(r.insuranceTotal).toBe(3_279_150);
  });

  it('should cap the insurance base when a cap is configured (GROSS over cap)', () => {
    const r = computePayslip(
      fullMonthInput({
        settings: { ...SETTINGS, insuranceBase: 'GROSS', insuranceCap: 20_000_000 },
      }),
    );
    // capped at 20,000,000
    expect(r.socialInsurance).toBe(1_600_000);
    expect(r.healthInsurance).toBe(300_000);
    expect(r.unemploymentInsurance).toBe(200_000);
    expect(r.insuranceTotal).toBe(2_100_000);
  });

  it('should not raise the base when the cap exceeds the actual base', () => {
    const r = computePayslip(
      fullMonthInput({
        settings: { ...SETTINGS, insuranceCap: 50_000_000 },
      }),
    );
    // base 30M < cap 50M → unaffected
    expect(r.insuranceTotal).toBe(3_150_000);
  });
});

describe('computePayslip — taxable income floor', () => {
  it('should floor taxable income at 0 and yield no PIT for a low salary', () => {
    const r = computePayslip(
      fullMonthInput({
        baseSalary: 8_000_000,
        allowances: [],
        dependents: 0,
      }),
    );
    // gross 8M − insurance − 11M personal < 0 → taxable 0, PIT 0
    expect(r.taxableIncome).toBe(0);
    expect(r.personalIncomeTax).toBe(0);
  });
});

describe('computePayslip — other deductions', () => {
  it('should subtract other deductions from net without affecting taxable income', () => {
    const r = computePayslip(fullMonthInput({ otherDeductions: 1_000_000 }));
    expect(r.otherDeductions).toBe(1_000_000);
    expect(r.taxableIncome).toBe(12_180_000); // unchanged
    expect(r.netPay).toBe(26_003_000); // 27,003,000 − 1,000,000
  });
});

describe('computePayslip — union fee (phí công đoàn)', () => {
  it('should be 0 when the union fee rate is 0 (default)', () => {
    const r = computePayslip(fullMonthInput());
    expect(r.unionFee).toBe(0);
    expect(r.netPay).toBe(27_003_000); // unchanged from the default full-month case
  });

  it('should charge the fee on the insurance base and deduct it POST-tax (net only)', () => {
    const r = computePayslip(
      fullMonthInput({ settings: { ...SETTINGS, unionFeeRate: 0.01 } }),
    );
    // base 30M × 1% = 300,000 — on the same (uncapped BASE_SALARY) insurance base
    expect(r.unionFee).toBe(300_000);
    // taxable income MUST be unchanged: union dues are not a PIT deduction
    expect(r.taxableIncome).toBe(12_180_000);
    expect(r.personalIncomeTax).toBe(1_077_000);
    // net drops by exactly the union fee
    expect(r.netPay).toBe(26_703_000); // 27,003,000 − 300,000
  });

  it('should apply the union fee on the capped GROSS base when configured', () => {
    const r = computePayslip(
      fullMonthInput({
        settings: { ...SETTINGS, unionFeeRate: 0.02, insuranceBase: 'GROSS', insuranceCap: 20_000_000 },
      }),
    );
    // same capped base the insurance rates use: 20,000,000 × 2% = 400,000
    expect(r.unionFee).toBe(400_000);
  });
});
