import type { AllowanceItem, TimesheetSummaryDto } from '@hrm/shared';
import {
  computePayslip,
  type PayslipEngineSettings,
  type PayslipOvertimeLine,
} from './payslip.engine.js';

// The engine settings, re-exported under a run-scoped name so the run service
// and its tests don't reach into the engine module directly.
export type PayrollRunSettings = PayslipEngineSettings;

// One employee's resolved payroll inputs: their in-force salary + dependents,
// paired with the snapshotted attendance summary for the period. The summary is
// the frozen SPEC-010 contract — never re-derived here.
export interface RunMemberInput {
  employeeId: string;
  baseSalary: number;
  allowances: AllowanceItem[];
  dependents: number;
  summary: TimesheetSummaryDto;
}

// A computed payslip line: every snapshotted input plus the full breakdown, all
// whole-VND numbers. Maps 1:1 to the persisted Payslip row (sans tenant/run ids).
export interface RunPayslipLine {
  employeeId: string;
  // snapshotted inputs
  baseSalary: number;
  allowances: AllowanceItem[];
  dependents: number;
  workingDays: number;
  daysPresent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  daysAbsent: number;
  holidayCount: number;
  overtime: PayslipOvertimeLine[];
  // computed breakdown
  proratedBase: number;
  allowanceTotal: number;
  otPay: number;
  grossPay: number;
  socialInsurance: number;
  healthInsurance: number;
  unemploymentInsurance: number;
  insuranceTotal: number;
  taxableIncome: number;
  personalIncomeTax: number;
  unionFee: number;
  otherDeductions: number;
  netPay: number;
}

export interface RunTotals {
  headcount: number;
  totalGross: number;
  totalDeductions: number; // insurance + PIT + union fee + other deductions
  totalNet: number;
}

export interface PayrollRunResult {
  lines: RunPayslipLine[];
  totals: RunTotals;
}

/**
 * Pure orchestration: map each member's frozen attendance summary into engine
 * input, run `computePayslip`, and aggregate run-level totals. Deterministic and
 * side-effect-free — the service loads the inputs and persists the result.
 * Deductions == insurance + PIT + union fee + other, so totalGross − totalDeductions ==
 * totalNet at the run level (each figure is whole-VND, already rounded).
 */
export function assemblePayrollRun(
  members: RunMemberInput[],
  standardHoursPerDay: number,
  settings: PayrollRunSettings,
): PayrollRunResult {
  const lines: RunPayslipLine[] = members.map((m) => {
    const { summary } = m;
    const breakdown = computePayslip({
      baseSalary: m.baseSalary,
      allowances: m.allowances,
      dependents: m.dependents,
      standardHoursPerDay,
      attendance: {
        workingDaysInPeriod: summary.workingDaysInPeriod,
        daysPresent: summary.daysPresent,
        paidLeaveDays: summary.paidLeaveDays,
        unpaidLeaveDays: summary.unpaidLeaveDays,
        daysAbsent: summary.daysAbsent,
        holidayCount: summary.holidayCount,
        overtime: summary.overtime.map((o) => ({
          category: o.category,
          night: o.night,
          hours: o.hours,
          multiplier: o.multiplier,
        })),
      },
      settings,
    });

    return {
      employeeId: m.employeeId,
      baseSalary: m.baseSalary,
      allowances: m.allowances,
      dependents: m.dependents,
      workingDays: summary.workingDaysInPeriod,
      daysPresent: summary.daysPresent,
      paidLeaveDays: summary.paidLeaveDays,
      unpaidLeaveDays: summary.unpaidLeaveDays,
      daysAbsent: summary.daysAbsent,
      holidayCount: summary.holidayCount,
      overtime: breakdown.overtime,
      proratedBase: breakdown.proratedBase,
      allowanceTotal: breakdown.allowanceTotal,
      otPay: breakdown.otPay,
      grossPay: breakdown.grossPay,
      socialInsurance: breakdown.socialInsurance,
      healthInsurance: breakdown.healthInsurance,
      unemploymentInsurance: breakdown.unemploymentInsurance,
      insuranceTotal: breakdown.insuranceTotal,
      taxableIncome: breakdown.taxableIncome,
      personalIncomeTax: breakdown.personalIncomeTax,
      unionFee: breakdown.unionFee,
      otherDeductions: breakdown.otherDeductions,
      netPay: breakdown.netPay,
    };
  });

  const totals = lines.reduce<RunTotals>(
    (acc, l) => ({
      headcount: acc.headcount + 1,
      totalGross: acc.totalGross + l.grossPay,
      totalDeductions:
        acc.totalDeductions +
        l.insuranceTotal +
        l.personalIncomeTax +
        l.unionFee +
        l.otherDeductions,
      totalNet: acc.totalNet + l.netPay,
    }),
    { headcount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0 },
  );

  return { lines, totals };
}
