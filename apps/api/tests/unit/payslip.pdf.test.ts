import { describe, it, expect } from 'vitest';
import { renderPayslipPdf, renderRunPayslipsPdf } from '../../src/domain/payroll/payslip.pdf.js';
import type { PayslipDto, PayrollRunDto } from '@hrm/shared';

// A fully-populated payslip fixture, including OT lines, a non-taxable allowance
// and Vietnamese names/diacritics — the PDF must render all of it without error.
function makeSlip(overrides: Partial<PayslipDto> = {}): PayslipDto {
  return {
    id: 'slip-1',
    tenantId: 'tenant-1',
    payrollRunId: 'run-1',
    employeeId: 'emp-1',
    period: '2026-01',
    baseSalary: '30000000',
    allowances: [
      { name: 'Ăn trưa', amount: 730000, taxable: true },
      { name: 'Điện thoại', amount: 300000, taxable: false },
    ],
    dependents: 1,
    workingDays: 22,
    daysPresent: 20,
    paidLeaveDays: 1,
    unpaidLeaveDays: 1,
    daysAbsent: 0,
    holidayCount: 0,
    overtime: [
      { category: 'OT_WEEKDAY', night: false, hours: 4, multiplier: 1.5, amount: 1034483 },
      { category: 'OT_WEEKEND', night: true, hours: 2, multiplier: 2.7, amount: 931034 },
    ],
    proratedBase: '27272727',
    allowanceTotal: '1030000',
    otPay: '1965517',
    grossPay: '30268244',
    socialInsurance: '2400000',
    healthInsurance: '450000',
    unemploymentInsurance: '300000',
    insuranceTotal: '3150000',
    taxableIncome: '23388244',
    personalIncomeTax: '2807648',
    otherDeductions: '0',
    netPay: '24310596',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    employee: {
      id: 'emp-1',
      fullName: 'Nguyễn Văn Hậu',
      employeeCode: 'EMP-001',
      avatar: null,
      departmentName: 'Kỹ thuật',
    },
    ...overrides,
  };
}

const ctx = { companyName: 'Công ty Cổ phần CodeCrush' };

function isPdf(buf: Buffer): boolean {
  return buf.length > 1000 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

describe('renderPayslipPdf', () => {
  it('produces a non-empty PDF buffer with the %PDF header', async () => {
    const buf = await renderPayslipPdf(makeSlip(), ctx);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(isPdf(buf)).toBe(true);
  });

  it('renders a slip with no overtime and no allowances without error', async () => {
    const buf = await renderPayslipPdf(
      makeSlip({ overtime: [], allowances: [], otPay: '0', allowanceTotal: '0' }),
      ctx,
    );
    expect(isPdf(buf)).toBe(true);
  });

  it('renders a slip carrying other deductions without error', async () => {
    const buf = await renderPayslipPdf(makeSlip({ otherDeductions: '500000' }), ctx);
    expect(isPdf(buf)).toBe(true);
  });

  it('renders even when the employee relation is missing', async () => {
    const buf = await renderPayslipPdf(makeSlip({ employee: null }), ctx);
    expect(isPdf(buf)).toBe(true);
  });
});

describe('renderRunPayslipsPdf', () => {
  function makeRun(payslips: PayslipDto[]): PayrollRunDto {
    return {
      id: 'run-1',
      tenantId: 'tenant-1',
      period: '2026-01',
      status: 'APPROVED',
      headcount: payslips.length,
      totalGross: '60536488',
      totalDeductions: '11915296',
      totalNet: '48621192',
      runById: null,
      approvedById: null,
      approvedAt: '2026-02-02T00:00:00.000Z',
      paidAt: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      payslips,
    };
  }

  it('produces a single PDF covering every payslip in the run', async () => {
    const run = makeRun([
      makeSlip({ id: 's1', employeeId: 'e1' }),
      makeSlip({ id: 's2', employeeId: 'e2', employee: { id: 'e2', fullName: 'Trần Thị Bích', employeeCode: 'EMP-002', avatar: null, departmentName: 'Nhân sự' } }),
    ]);
    const buf = await renderRunPayslipsPdf(run, ctx);
    expect(isPdf(buf)).toBe(true);
  });

  it('renders a run with no payslips without error', async () => {
    const buf = await renderRunPayslipsPdf(makeRun([]), ctx);
    expect(isPdf(buf)).toBe(true);
  });
});
