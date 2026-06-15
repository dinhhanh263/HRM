import { payrollRunRepository } from '../repositories/payroll-run.repository.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { payrollSettingsService } from './payroll-settings.service.js';
import { timesheetPolicyService } from './timesheet-policy.service.js';
import { timesheetSummaryService } from './timesheet-summary.service.js';
import { assemblePayrollRun, type PayrollRunSettings, type RunMemberInput } from '../payroll/run.helper.js';
import { toPayrollRunDto } from '../payroll/mappers.js';
import { renderRunPayslipsPdf } from '../payroll/payslip.pdf.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { buildPayrollRunsLink } from '../../shared/configs/email.config.js';
import { logger } from '../../shared/utils/logger.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type {
  AllowanceItem,
  PayrollRunDto,
  PayrollRunListQuery,
  PayrollSettingsDto,
} from '@hrm/shared';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// The DTO carries money as VND strings; the engine works in numbers. Convert the
// tenant settings into the numeric engine settings once per run.
function toEngineSettings(s: PayrollSettingsDto): PayrollRunSettings {
  return {
    socialInsuranceRate: s.socialInsuranceRate,
    healthInsuranceRate: s.healthInsuranceRate,
    unemploymentInsuranceRate: s.unemploymentInsuranceRate,
    unionFeeRate: s.unionFeeRate,
    insuranceBase: s.insuranceBase,
    insuranceCap: s.insuranceCap != null ? Number(s.insuranceCap) : null,
    personalDeduction: Number(s.personalDeduction),
    dependentDeduction: Number(s.dependentDeduction),
    taxBrackets: s.taxBrackets,
  };
}

// The last calendar day of the period (UTC midnight) — the as-of date for
// resolving each employee's in-force salary, so a raise mid-month applies.
function periodEnd(period: string): Date {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return new Date(Date.UTC(year, month, 0));
}

// Resolve the payable roster for a period, run the engine and persist the lines.
// Shared by createRun (new/replace) and recompute (existing DRAFT). Returns the
// run id; the caller re-reads with payslips for the response.
async function computeAndPersist(
  tenantId: string,
  period: string,
  runById: string | null,
  existingRunId: string | null,
): Promise<string> {
  const [settingsDto, policy] = await Promise.all([
    payrollSettingsService.getSettings(tenantId),
    timesheetPolicyService.getPolicy(tenantId),
  ]);
  const settings = toEngineSettings(settingsDto);

  const asOf = periodEnd(period);
  const employees = await payrollRunRepository.listPayableEmployees(tenantId, asOf);

  // Only employees with an in-force salary are payable; the rest are skipped.
  const payable = employees.filter((e) => e.salaries.length > 0);

  const members: RunMemberInput[] = await Promise.all(
    payable.map(async (e) => {
      const salary = e.salaries[0];
      const summary = await timesheetSummaryService.getSummary(tenantId, e.id, period);
      return {
        employeeId: e.id,
        baseSalary: Number(salary.baseSalary),
        allowances: (salary.allowances as unknown as AllowanceItem[]) ?? [],
        dependents: e.dependentsCount,
        summary,
      };
    }),
  );

  const { lines, totals } = assemblePayrollRun(members, policy.standardHoursPerDay, settings);

  return payrollRunRepository.saveDraftWithPayslips({
    tenantId,
    period,
    runById,
    existingRunId,
    totals,
    payslips: lines,
  });
}

/**
 * Best-effort: email everyone who can approve that a run is awaiting them. Runs
 * after the DRAFT→PENDING_APPROVAL commit, so a mail failure never rolls back
 * the transition — each recipient is sent independently and errors are logged.
 */
async function notifyApprovers(
  tenantId: string,
  run: PayrollRunDto,
  submittedById: string | null,
): Promise<void> {
  try {
    const recipients = await payrollRunRepository.findApproverRecipients(tenantId, submittedById);
    const link = buildPayrollRunsLink();
    const results = await Promise.all(
      recipients.map((r) =>
        emailProvider
          .sendPayrollApprovalRequest({
            to: r.email,
            approverName: r.fullName,
            period: run.period,
            headcount: run.headcount,
            totalNet: run.totalNet,
            link,
          })
          .then(() => true)
          .catch((err) => {
            logger.error(
              { event: 'email.payroll_approval.failed', to: r.email, period: run.period, err },
              'Failed to send payroll approval email',
            );
            return false;
          }),
      ),
    );
    const failed = results.filter((ok) => !ok).length;
    logger.info(
      {
        event: 'email.payroll_approval.dispatched',
        tenantId,
        period: run.period,
        recipients: recipients.length,
        failed,
      },
      'Payroll approval notifications dispatched',
    );
  } catch (err) {
    logger.error(
      { event: 'email.payroll_approval.lookup_failed', tenantId, period: run.period, err },
      'Failed to resolve payroll approvers for notification',
    );
  }
}

export const payrollRunService = {
  async list(tenantId: string, query: PayrollRunListQuery): Promise<{ rows: PayrollRunDto[]; total: number }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const { rows, total } = await payrollRunRepository.list(
      tenantId,
      { status: query.status, period: query.period },
      page,
      limit,
    );
    return { rows: rows.map(toPayrollRunDto), total };
  },

  async getById(tenantId: string, id: string): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findByIdWithPayslips(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    return toPayrollRunDto(run);
  },

  /**
   * Create and compute a DRAFT run for a period: resolve each ACTIVE employee's
   * in-force salary, pull the frozen attendance summary, run the engine and
   * persist a payslip line per employee plus the run totals. Re-running an
   * existing DRAFT (or reviving a CANCELLED run) replaces its lines idempotently;
   * an APPROVED/PAID run is locked and rejected with a 409.
   */
  async createRun(tenantId: string, period: string, runById: string | null): Promise<PayrollRunDto> {
    if (!PERIOD_RE.test(period)) {
      throw new BadRequestError('period must be in YYYY-MM format');
    }

    const existing = await payrollRunRepository.findByPeriod(tenantId, period);
    if (existing && (existing.status === 'APPROVED' || existing.status === 'PAID')) {
      throw new ConflictError(`A ${existing.status.toLowerCase()} payroll run already exists for ${period}`);
    }

    const runId = await computeAndPersist(tenantId, period, runById, existing?.id ?? null);
    return this.getById(tenantId, runId);
  },

  /**
   * Recompute an existing DRAFT run in place — re-resolves salaries/summaries and
   * replaces its lines from current settings. DRAFT-only: an APPROVED/PAID run is
   * frozen and rejected with a 409.
   */
  async recompute(tenantId: string, id: string, runById: string | null): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'DRAFT') {
      throw new ConflictError('Only a draft run can be recomputed');
    }

    await computeAndPersist(tenantId, run.period, runById, run.id);
    return this.getById(tenantId, id);
  },

  /**
   * Submit a DRAFT run for approval (DRAFT → PENDING_APPROVAL), recording the
   * submitter. Maker step of maker-checker: gated by payroll:process at the
   * route. A run with no payslips can't be submitted; a non-DRAFT run → 409.
   */
  async submit(tenantId: string, id: string, submittedById: string | null): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'DRAFT') {
      throw new ConflictError('Only a draft run can be submitted for approval');
    }
    if (run.headcount <= 0) {
      throw new BadRequestError('Cannot submit an empty payroll run for approval');
    }

    const count = await payrollRunRepository.submit(tenantId, id, submittedById);
    if (count === 0) {
      throw new ConflictError('Only a draft run can be submitted for approval');
    }

    const dto = await this.getById(tenantId, id);
    await notifyApprovers(tenantId, dto, submittedById);
    return dto;
  },

  /**
   * Approve a submitted run (PENDING_APPROVAL → APPROVED): freeze the current
   * tenant settings onto the run (the per-line attendance/salary inputs are
   * already snapshotted at compute time) and lock it. Checker step of
   * maker-checker: gated by payroll:approve at the route. Segregation of duties
   * is enforced here too — the submitter may not approve their own run. A run
   * that hasn't been submitted → 409; an APPROVED run is immutable.
   */
  async approve(tenantId: string, id: string, approvedById: string | null): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'PENDING_APPROVAL') {
      throw new ConflictError('Only a run pending approval can be approved');
    }
    if (run.submittedById && approvedById && run.submittedById === approvedById) {
      throw new ForbiddenError('You cannot approve a payroll run you submitted');
    }

    const settings = await payrollSettingsService.getSettings(tenantId);
    const count = await payrollRunRepository.approve(tenantId, id, approvedById, settings);
    if (count === 0) {
      throw new ConflictError('Only a run pending approval can be approved');
    }
    return this.getById(tenantId, id);
  },

  /**
   * Reject a submitted run back to the maker (PENDING_APPROVAL → DRAFT), clearing
   * the submission markers so HR can recompute and resubmit. Checker step: gated
   * by payroll:approve at the route. A run that isn't pending approval → 409.
   */
  async reject(tenantId: string, id: string): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'PENDING_APPROVAL') {
      throw new ConflictError('Only a run pending approval can be rejected');
    }

    const count = await payrollRunRepository.reject(tenantId, id);
    if (count === 0) {
      throw new ConflictError('Only a run pending approval can be rejected');
    }
    return this.getById(tenantId, id);
  },

  /**
   * Mark an APPROVED run as PAID (records paidAt). Any other status → 409.
   * Deliberately gated by payroll:process (not payroll:approve): disbursement is
   * an HR/operations step that happens *after* the maker-checker approval, so it
   * sits outside the segregation-of-duties boundary that guards DRAFT→APPROVED.
   */
  async markPaid(tenantId: string, id: string): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'APPROVED') {
      throw new ConflictError('Only an approved run can be marked paid');
    }

    const count = await payrollRunRepository.markPaid(tenantId, id);
    if (count === 0) {
      throw new ConflictError('Only an approved run can be marked paid');
    }
    return this.getById(tenantId, id);
  },

  /** Cancel a DRAFT, PENDING_APPROVAL or APPROVED run. A PAID run cannot be cancelled (409). */
  async cancel(tenantId: string, id: string): Promise<PayrollRunDto> {
    const run = await payrollRunRepository.findById(tenantId, id);
    if (!run) {
      throw new NotFoundError('Payroll run not found');
    }
    if (run.status !== 'DRAFT' && run.status !== 'PENDING_APPROVAL' && run.status !== 'APPROVED') {
      throw new ConflictError(`A ${run.status.toLowerCase()} run cannot be cancelled`);
    }

    const count = await payrollRunRepository.cancel(tenantId, id);
    if (count === 0) {
      throw new ConflictError(`A ${run.status.toLowerCase()} run cannot be cancelled`);
    }
    return this.getById(tenantId, id);
  },

  /**
   * Render every payslip in a run as a single multi-page PDF (one page per
   * employee). HR-only at the route layer (payroll:export). A missing run 404s.
   */
  async renderRunPdf(tenantId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const run = await this.getById(tenantId, id);
    const tenant = await tenantRepository.findById(tenantId);
    const buffer = await renderRunPayslipsPdf(run, { companyName: tenant?.name ?? '' });
    return { buffer, filename: `payroll-${run.period}.pdf` };
  },
};
