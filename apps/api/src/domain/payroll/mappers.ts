import type { EmployeeSalary, PayrollRun, PayrollSettings, Payslip } from '@prisma/client';
import type {
  AllowanceItem,
  EmployeeSalaryDto,
  InsuranceBase,
  PayrollEmployeeDto,
  PayrollRunDto,
  PayrollSettingsDto,
  PayrollRunStatus,
  PayslipDto,
  PayslipOvertimeDto,
  TaxBracket,
} from '@hrm/shared';

// Money is Decimal end-to-end; serialize to a whole-VND string at the DTO edge.
// Prisma.Decimal stringifies losslessly, but settings amounts are whole VND so
// we drop any fractional part for a clean contract.
function decToVndString(value: { toString(): string } | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Math.round(Number(value)).toString();
}

export function toPayrollSettingsDto(s: PayrollSettings): PayrollSettingsDto {
  return {
    id: s.id,
    tenantId: s.tenantId,
    currency: s.currency,
    payDay: s.payDay,
    socialInsuranceRate: s.socialInsuranceRate,
    healthInsuranceRate: s.healthInsuranceRate,
    unemploymentInsuranceRate: s.unemploymentInsuranceRate,
    unionFeeRate: s.unionFeeRate,
    insuranceBase: s.insuranceBase as InsuranceBase,
    insuranceCap: decToVndString(s.insuranceCap),
    personalDeduction: decToVndString(s.personalDeduction) ?? '0',
    dependentDeduction: decToVndString(s.dependentDeduction) ?? '0',
    taxBrackets: s.taxBrackets as unknown as TaxBracket[],
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// An effective-dated salary row, optionally joined with its employee for list views.
type EmployeeSalaryRow = EmployeeSalary & {
  employee?: {
    id: string;
    fullName: string;
    employeeCode: string;
    avatar: string | null;
    department: { name: string } | null;
  } | null;
};

export function toEmployeeSalaryDto(s: EmployeeSalaryRow): EmployeeSalaryDto {
  return {
    id: s.id,
    tenantId: s.tenantId,
    employeeId: s.employeeId,
    baseSalary: decToVndString(s.baseSalary) ?? '0',
    allowances: (s.allowances as unknown as AllowanceItem[]) ?? [],
    effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: s.effectiveTo ? s.effectiveTo.toISOString().slice(0, 10) : null,
    note: s.note,
    createdById: s.createdById,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    employee: s.employee
      ? {
          id: s.employee.id,
          fullName: s.employee.fullName,
          employeeCode: s.employee.employeeCode,
          avatar: s.employee.avatar,
          departmentName: s.employee.department?.name ?? null,
        }
      : undefined,
  };
}

// A non-null whole-VND string for the always-present payslip money columns.
function vnd(value: { toString(): string }): string {
  return Math.round(Number(value)).toString();
}

type PayrollEmployeeRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  department: { name: string } | null;
} | null;

function toPayrollEmployeeDto(e: PayrollEmployeeRow): PayrollEmployeeDto | undefined {
  return e
    ? {
        id: e.id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
        avatar: e.avatar,
        departmentName: e.department?.name ?? null,
      }
    : undefined;
}

type PayslipRow = Payslip & { employee?: PayrollEmployeeRow };

export function toPayslipDto(p: PayslipRow, period: string): PayslipDto {
  return {
    id: p.id,
    tenantId: p.tenantId,
    payrollRunId: p.payrollRunId,
    employeeId: p.employeeId,
    period,
    baseSalary: vnd(p.baseSalary),
    allowances: (p.allowances as unknown as AllowanceItem[]) ?? [],
    dependents: p.dependents,
    workingDays: p.workingDays,
    daysPresent: p.daysPresent,
    paidLeaveDays: p.paidLeaveDays,
    unpaidLeaveDays: p.unpaidLeaveDays,
    daysAbsent: p.daysAbsent,
    holidayCount: p.holidayCount,
    overtime: (p.overtime as unknown as PayslipOvertimeDto[]) ?? [],
    proratedBase: vnd(p.proratedBase),
    allowanceTotal: vnd(p.allowanceTotal),
    otPay: vnd(p.otPay),
    grossPay: vnd(p.grossPay),
    socialInsurance: vnd(p.socialInsurance),
    healthInsurance: vnd(p.healthInsurance),
    unemploymentInsurance: vnd(p.unemploymentInsurance),
    insuranceTotal: vnd(p.insuranceTotal),
    taxableIncome: vnd(p.taxableIncome),
    personalIncomeTax: vnd(p.personalIncomeTax),
    unionFee: vnd(p.unionFee),
    otherDeductions: vnd(p.otherDeductions),
    netPay: vnd(p.netPay),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    employee: toPayrollEmployeeDto(p.employee ?? null),
  };
}

type PayrollRunRow = PayrollRun & { payslips?: PayslipRow[] };

export function toPayrollRunDto(r: PayrollRunRow): PayrollRunDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    period: r.period,
    status: r.status as PayrollRunStatus,
    headcount: r.headcount,
    totalGross: vnd(r.totalGross),
    totalDeductions: vnd(r.totalDeductions),
    totalNet: vnd(r.totalNet),
    runById: r.runById,
    submittedById: r.submittedById,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    approvedById: r.approvedById,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    payslips: r.payslips ? r.payslips.map((p) => toPayslipDto(p, r.period)) : undefined,
  };
}
