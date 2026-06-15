import { describe, it, expect } from 'vitest';
import {
  assemblePayrollRun,
  type RunMemberInput,
  type PayrollRunSettings,
} from '../../src/domain/payroll/run.helper.js';
import { DEFAULT_TAX_BRACKETS } from '../../src/domain/payroll/defaults.js';
import type { TimesheetSummaryDto } from '@hrm/shared';

// Numeric settings mirroring the seeded VN defaults (same as the engine test).
const SETTINGS: PayrollRunSettings = {
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

const STANDARD_HOURS = 8;

// A clean full-month attendance summary: 20 workdays, all present, no leave/OT.
function fullMonthSummary(
  employeeId: string,
  overrides: Partial<TimesheetSummaryDto> = {},
): TimesheetSummaryDto {
  return {
    employeeId,
    month: '2026-05',
    workingDaysInPeriod: 20,
    daysPresent: 20,
    daysAbsent: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    holidayCount: 0,
    totalWorkedHours: 160,
    overtime: [],
    ...overrides,
  };
}

// Member A: 30M base, one taxable + one non-taxable allowance, 1 dependent —
// the exact full-month case proven in the engine test (net 27,003,000).
function memberA(summary?: TimesheetSummaryDto): RunMemberInput {
  return {
    employeeId: 'emp-a',
    baseSalary: 30_000_000,
    allowances: [
      { name: 'Ăn trưa', amount: 730_000, taxable: true },
      { name: 'Điện thoại', amount: 500_000, taxable: false },
    ],
    dependents: 1,
    summary: summary ?? fullMonthSummary('emp-a'),
  };
}

// Member B: 20M base, no allowances, 0 dependents — net 17,460,000.
function memberB(summary?: TimesheetSummaryDto): RunMemberInput {
  return {
    employeeId: 'emp-b',
    baseSalary: 20_000_000,
    allowances: [],
    dependents: 0,
    summary: summary ?? fullMonthSummary('emp-b'),
  };
}

describe('assemblePayrollRun — single member', () => {
  it('should compute one line carrying the engine breakdown', () => {
    const { lines } = assemblePayrollRun([memberA()], STANDARD_HOURS, SETTINGS);
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l.employeeId).toBe('emp-a');
    expect(l.proratedBase).toBe(30_000_000);
    expect(l.allowanceTotal).toBe(1_230_000);
    expect(l.grossPay).toBe(31_230_000);
    expect(l.insuranceTotal).toBe(3_150_000);
    expect(l.taxableIncome).toBe(12_180_000);
    expect(l.personalIncomeTax).toBe(1_077_000);
    expect(l.otherDeductions).toBe(0);
    expect(l.netPay).toBe(27_003_000);
  });

  it('should snapshot the attendance inputs onto the line', () => {
    const summary = fullMonthSummary('emp-a', {
      daysPresent: 17,
      unpaidLeaveDays: 2,
      daysAbsent: 1,
      holidayCount: 0,
    });
    const { lines } = assemblePayrollRun([memberA(summary)], STANDARD_HOURS, SETTINGS);
    const l = lines[0];
    expect(l.baseSalary).toBe(30_000_000);
    expect(l.dependents).toBe(1);
    expect(l.workingDays).toBe(20);
    expect(l.daysPresent).toBe(17);
    expect(l.unpaidLeaveDays).toBe(2);
    expect(l.daysAbsent).toBe(1);
    expect(l.allowances).toHaveLength(2);
    // 30M × (20−2−1)/20 = 25,500,000 — proration flows from the snapshot
    expect(l.proratedBase).toBe(25_500_000);
  });

  it('should carry OT lines with their computed amount into the snapshot', () => {
    const summary = fullMonthSummary('emp-a', {
      overtime: [
        { category: 'OT_WEEKDAY', night: false, hours: 10, multiplier: 1.5 },
        { category: 'OT_WEEKEND', night: true, hours: 5, multiplier: 2.7 },
      ],
    });
    const { lines } = assemblePayrollRun([memberA(summary)], STANDARD_HOURS, SETTINGS);
    const l = lines[0];
    // hourlyRate = 30,000,000 / (20×8) = 187,500
    expect(l.overtime).toHaveLength(2);
    expect(l.overtime[0].amount).toBe(2_812_500);
    expect(l.overtime[1].amount).toBe(2_531_250);
    expect(l.otPay).toBe(5_343_750);
  });
});

describe('assemblePayrollRun — totals', () => {
  it('should aggregate headcount and totals across members', () => {
    const { lines, totals } = assemblePayrollRun([memberA(), memberB()], STANDARD_HOURS, SETTINGS);
    expect(lines).toHaveLength(2);
    expect(totals.headcount).toBe(2);
    expect(totals.totalGross).toBe(51_230_000); // 31,230,000 + 20,000,000
    expect(totals.totalDeductions).toBe(6_767_000); // 4,227,000 + 2,540,000
    expect(totals.totalNet).toBe(44_463_000); // 27,003,000 + 17,460,000
  });

  it('should keep gross − deductions == net at the run level', () => {
    const { totals } = assemblePayrollRun([memberA(), memberB()], STANDARD_HOURS, SETTINGS);
    expect(totals.totalGross - totals.totalDeductions).toBe(totals.totalNet);
  });

  it('should define deductions as insurance + PIT + other deductions', () => {
    const { lines, totals } = assemblePayrollRun([memberB()], STANDARD_HOURS, SETTINGS);
    const l = lines[0];
    expect(totals.totalDeductions).toBe(
      l.insuranceTotal + l.personalIncomeTax + l.unionFee + l.otherDeductions,
    );
  });

  it('should yield zero totals and no lines for an empty roster', () => {
    const { lines, totals } = assemblePayrollRun([], STANDARD_HOURS, SETTINGS);
    expect(lines).toEqual([]);
    expect(totals).toEqual({ headcount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0 });
  });
});
