// Payroll DTOs — the contract shared by the API and the web client. Money is
// always serialized as a string (Decimal end-to-end), VND, whole-number. Every
// computed intermediate figure is surfaced for transparency (no black-box totals).

import type { OvertimeCategory } from './timesheet.js';

export const PayrollRunStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;

export type PayrollRunStatus = (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus];

// Which figure the employee-side insurance percentages apply to.
export const InsuranceBase = {
  GROSS: 'GROSS',
  BASE_SALARY: 'BASE_SALARY',
} as const;

export type InsuranceBase = (typeof InsuranceBase)[keyof typeof InsuranceBase];

// ── Payroll settings (per-tenant config) ────────────────────────────────────

// One progressive PIT bracket. `upTo` is the upper bound of *taxable income*
// for this bracket in VND; null = the top (open-ended) bracket. `rate` is the
// marginal rate as a fraction (e.g. 0.05 = 5%). Brackets are ordered ascending.
export interface TaxBracket {
  upTo: number | null;
  rate: number;
}

export interface PayrollSettingsDto {
  id: string;
  tenantId: string;
  currency: string;
  payDay: number; // day-of-month, informational
  socialInsuranceRate: number; // BHXH (employee-side)
  healthInsuranceRate: number; // BHYT
  unemploymentInsuranceRate: number; // BHTN
  unionFeeRate: number; // Phí công đoàn (employee-side); same base as insurance, post-tax
  insuranceBase: InsuranceBase;
  insuranceCap: string | null; // VND ceiling the rates apply to, or null = uncapped
  personalDeduction: string; // VND
  dependentDeduction: string; // VND per dependent
  taxBrackets: TaxBracket[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePayrollSettingsRequest {
  currency?: string;
  payDay?: number;
  socialInsuranceRate?: number;
  healthInsuranceRate?: number;
  unemploymentInsuranceRate?: number;
  unionFeeRate?: number;
  insuranceBase?: InsuranceBase;
  insuranceCap?: string | null;
  personalDeduction?: string;
  dependentDeduction?: string;
  taxBrackets?: TaxBracket[];
}

// ── Employee salary (effective-dated history) ───────────────────────────────

export interface AllowanceItem {
  name: string;
  amount: number; // VND
  taxable: boolean; // false = excluded from taxable income
}

export interface EmployeeSalaryDto {
  id: string;
  tenantId: string;
  employeeId: string;
  baseSalary: string; // VND
  allowances: AllowanceItem[];
  effectiveFrom: string; // ISO date (YYYY-MM-DD)
  effectiveTo: string | null; // null = currently in force
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: PayrollEmployeeDto | null;
}

export interface CreateEmployeeSalaryRequest {
  employeeId: string;
  baseSalary: string;
  allowances?: AllowanceItem[];
  effectiveFrom: string; // YYYY-MM-DD
  note?: string;
}

export interface SalaryListQuery {
  departmentId?: string;
  search?: string;
}

// One row of the salary sheet: an employee paired with their currently in-force
// salary (null if none has been set yet).
export interface SalaryRosterEntryDto {
  employee: PayrollEmployeeDto;
  salary: EmployeeSalaryDto | null;
}

// ── Payroll run + payslip ───────────────────────────────────────────────────

export interface PayrollEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
}

// Per-line OT breakdown: the snapshotted timesheet OT plus the computed pay.
export interface PayslipOvertimeDto {
  category: OvertimeCategory;
  night: boolean;
  hours: number;
  multiplier: number;
  amount: string; // VND
}

export interface PayslipDto {
  id: string;
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  period: string; // YYYY-MM, carried from the run for convenience

  // snapshotted inputs
  baseSalary: string;
  allowances: AllowanceItem[];
  dependents: number;
  workingDays: number;
  daysPresent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  daysAbsent: number;
  holidayCount: number;
  overtime: PayslipOvertimeDto[];

  // computed breakdown (all VND strings)
  proratedBase: string;
  allowanceTotal: string;
  otPay: string;
  grossPay: string;
  socialInsurance: string;
  healthInsurance: string;
  unemploymentInsurance: string;
  insuranceTotal: string;
  taxableIncome: string;
  personalIncomeTax: string;
  unionFee: string; // Phí công đoàn — post-tax deduction, reduces net pay only
  otherDeductions: string;
  netPay: string;

  createdAt: string;
  updatedAt: string;
  employee?: PayrollEmployeeDto | null;
}

export interface PayrollRunDto {
  id: string;
  tenantId: string;
  period: string; // YYYY-MM
  status: PayrollRunStatus;
  headcount: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  runById: string | null;
  submittedById: string | null;
  submittedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  payslips?: PayslipDto[]; // included on the run-detail endpoint
}

export interface CreatePayrollRunRequest {
  period: string; // YYYY-MM
}

export interface PayrollRunListQuery {
  page?: number;
  limit?: number;
  status?: PayrollRunStatus;
  period?: string; // YYYY-MM
}

export interface PayslipListQuery {
  page?: number;
  limit?: number;
  period?: string; // YYYY-MM
}
