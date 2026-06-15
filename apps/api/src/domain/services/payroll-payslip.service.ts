import { payrollPayslipRepository } from '../repositories/payroll-payslip.repository.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { toPayslipDto } from '../payroll/mappers.js';
import { renderPayslipPdf } from '../payroll/payslip.pdf.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { PayslipDto, PayslipListQuery } from '@hrm/shared';

// Runs an employee is allowed to see their own lines for. DRAFT/CANCELLED are
// HR-only work-in-progress and never surfaced to the owner.
const EMPLOYEE_VISIBLE_STATUSES = ['APPROVED', 'PAID'] as const;

// Who is asking, and whether they may cross the self-scope boundary.
export interface PayslipViewer {
  employeeId: string | null; // the caller's own employee id, if linked
  canProcess: boolean; // holds payroll:process (HR) → may read anyone, any status
}

export const payslipService = {
  /** The caller's own payslips, newest first, limited to APPROVED/PAID runs. */
  async listMine(
    tenantId: string,
    employeeId: string,
    query: PayslipListQuery,
  ): Promise<{ rows: PayslipDto[]; total: number }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const { rows, total } = await payrollPayslipRepository.listForEmployee(
      tenantId,
      employeeId,
      { statuses: [...EMPLOYEE_VISIBLE_STATUSES], period: query.period },
      page,
      limit,
    );
    return { rows: rows.map((p) => toPayslipDto(p, p.payrollRun.period)), total };
  },

  /**
   * A single payslip, self-scoped. HR (payroll:process) reads any line in any
   * status. Otherwise the caller must own it (else 403) and the parent run must
   * be APPROVED/PAID (a DRAFT line is hidden as 404, not yet "issued").
   */
  async getForViewer(tenantId: string, id: string, viewer: PayslipViewer): Promise<PayslipDto> {
    const slip = await payrollPayslipRepository.findById(tenantId, id);
    if (!slip) {
      throw new NotFoundError('Payslip not found');
    }

    if (!viewer.canProcess) {
      if (slip.employeeId !== viewer.employeeId) {
        throw new ForbiddenError('You may only view your own payslip');
      }
      if (!EMPLOYEE_VISIBLE_STATUSES.includes(slip.payrollRun.status as 'APPROVED' | 'PAID')) {
        throw new NotFoundError('Payslip not found');
      }
    }

    return toPayslipDto(slip, slip.payrollRun.period);
  },

  /**
   * Render a self-scoped payslip as a PDF. Reuses getForViewer for the exact
   * same access rules (own APPROVED/PAID, or any for HR), then embeds the
   * tenant company name in the header.
   */
  async renderPdf(
    tenantId: string,
    id: string,
    viewer: PayslipViewer,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const slip = await this.getForViewer(tenantId, id, viewer);
    const tenant = await tenantRepository.findById(tenantId);
    const buffer = await renderPayslipPdf(slip, { companyName: tenant?.name ?? '' });
    const code = slip.employee?.employeeCode ?? slip.employeeId;
    return { buffer, filename: `payslip-${slip.period}-${code}.pdf` };
  },
};
