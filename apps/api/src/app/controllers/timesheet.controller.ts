import type { Request, Response } from 'express';
import { timesheetPolicyService } from '../../domain/services/timesheet-policy.service.js';
import { holidayService } from '../../domain/services/holiday.service.js';
import { attendanceService } from '../../domain/services/attendance.service.js';
import { overtimeService } from '../../domain/services/overtime.service.js';
import { timesheetSummaryService } from '../../domain/services/timesheet-summary.service.js';
import { approvalFlowService } from '../../domain/services/approval-flow.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { roleRepository } from '../../domain/repositories/role.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import { ApprovalFlowType } from '@prisma/client';
import type { ApprovalActor } from '../../domain/leave/approval-routing.helper.js';

/** Resolve the Employee linked to the authenticated user, or throw if none. */
async function requireCurrentEmployee(req: Request) {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  if (!employee) {
    throw new BadRequestError('No employee profile is linked to your account');
  }
  return employee;
}

/**
 * Tenant-wide attendance visibility (HR scope). SUPER_ADMIN is implicit-all;
 * otherwise only roles granted `timesheet:configure` (HR) may read every
 * employee's records. Managers fall back to their direct reports.
 */
async function canViewAllAttendance(req: Request): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  if (!user.roleId) {
    return false;
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('timesheet:configure');
}

/**
 * Gate the tenant-wide OT review browse (scope=all): only SUPER_ADMIN or a role
 * granted `timesheet:approve`/`timesheet:configure` may see every request.
 */
async function requireReviewCapability(req: Request) {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return;
  }
  if (!user.roleId) {
    throw new ForbiddenError('You do not have permission to review overtime requests');
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  if (!granted.has('timesheet:approve') && !granted.has('timesheet:configure')) {
    throw new ForbiddenError('You do not have permission to review overtime requests');
  }
}

/**
 * Build the actor the per-step OT approval engine needs: the reviewer's employee
 * id (null for profile-less admins), their role key (for ROLE-step capability
 * matching), and whether they are SUPER_ADMIN (implicit-all).
 */
async function buildApprovalActor(req: Request): Promise<ApprovalActor> {
  const user = req.user!;
  const employee = await employeeRepository.findByUserId(user.sub, user.tenantId);
  let roleKey: string | null = null;
  if (user.roleId) {
    const role = await roleRepository.findById(user.roleId, user.tenantId);
    roleKey = role?.key ?? null;
  }
  return {
    employeeId: employee?.id ?? null,
    roleKey,
    isSuperAdmin: user.role === 'SUPER_ADMIN',
  };
}

export const timesheetController = {
  // ---- Policy ----

  async getPolicy(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await timesheetPolicyService.getPolicy(tenantId);

    res.json({ success: true, data });
  },

  async updatePolicy(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await timesheetPolicyService.updatePolicy(tenantId, req.body);

    res.json({ success: true, data });
  },

  // ---- Holidays ----

  async listHolidays(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const yearRaw = req.query.year;
    const year = typeof yearRaw === 'string' && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
    const data = await holidayService.listByYear(tenantId, year);

    res.json({ success: true, data });
  },

  async createHoliday(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await holidayService.create(tenantId, req.body);

    res.status(201).json({ success: true, data });
  },

  async updateHoliday(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await holidayService.update(tenantId, req.params.id, req.body);

    res.json({ success: true, data });
  },

  async deleteHoliday(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await holidayService.remove(tenantId, req.params.id);

    res.status(204).send();
  },

  async seedHolidays(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await holidayService.seed(tenantId, req.body.year);

    res.json({ success: true, data });
  },

  // ---- Attendance (self-service) ----

  async listMyAttendance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const monthRaw = req.query.month;
    const month = typeof monthRaw === 'string' && monthRaw.length > 0 ? monthRaw : undefined;
    const data = await attendanceService.listMine(tenantId, employee.id, month);

    res.json({ success: true, data });
  },

  async checkIn(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const data = await attendanceService.checkIn(tenantId, employee.id, req.body);

    res.status(201).json({ success: true, data });
  },

  async checkOut(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const data = await attendanceService.checkOut(tenantId, employee.id, req.body);

    res.json({ success: true, data });
  },

  // ---- Attendance (reviewer scope) ----

  async listTeamAttendance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const monthRaw = req.query.month;
    const month = typeof monthRaw === 'string' && monthRaw.length > 0 ? monthRaw : undefined;
    const requestedAll = req.query.scope === 'all';

    let employeeIds: string[] | null;
    if (await canViewAllAttendance(req)) {
      // HR/super may view everyone; honor an explicit team request too.
      employeeIds = requestedAll ? null : await resolveReportIds(req, tenantId);
    } else {
      if (requestedAll) {
        throw new ForbiddenError('You may only view your team\'s attendance');
      }
      employeeIds = await resolveReportIds(req, tenantId);
    }

    const data = await attendanceService.listForReview(tenantId, employeeIds, month);
    res.json({ success: true, data });
  },

  async adjustAttendance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const reviewer = await requireCurrentEmployee(req);
    const data = await attendanceService.adjust(tenantId, reviewer.id, req.body);

    res.json({ success: true, data });
  },

  // ---- Overtime ----

  async submitOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const data = await overtimeService.submit(tenantId, employee.id, req.body);

    res.status(201).json({ success: true, data });
  },

  async listMyOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const { data, pagination } = await overtimeService.listMine(
      tenantId,
      employee.id,
      parseOvertimeListQuery(req),
    );

    res.json({ success: true, data, pagination });
  },

  // Reviewer list. Default = the caller's current-step review queue (only requests
  // awaiting *their* decision). scope=all = tenant-wide browse, restricted to
  // reviewers with approve/configure capability.
  async listTeamOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const query = parseOvertimeListQuery(req);

    if (req.query.scope === 'all') {
      await requireReviewCapability(req);
      const { data, pagination } = await overtimeService.listForReview(tenantId, null, query);
      res.json({ success: true, data, pagination });
      return;
    }

    const actor = await buildApprovalActor(req);
    const { data, pagination } = await overtimeService.listReviewQueue(tenantId, actor, query);

    res.json({ success: true, data, pagination });
  },

  // Single OT request with its approval timeline. Owners see their own; viewing
  // anyone else's detail requires review capability.
  async getOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const request = await overtimeService.getById(tenantId, req.params.id);

    const employee = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    if (!employee || request.employeeId !== employee.id) {
      await requireReviewCapability(req);
    }

    res.json({ success: true, data: request });
  },

  // Owner edits and resubmits their RETURNED request (snapshots a new round).
  async resubmitOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const data = await overtimeService.resubmit(tenantId, employee.id, req.params.id, req.body);

    res.json({ success: true, data });
  },

  // Reviewer approves the current step. At the final step the multiplier is
  // snapshotted and advisory cap warnings returned; earlier steps just advance.
  async approveOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);
    const data = await overtimeService.approve(tenantId, actor, req.params.id);

    res.json({ success: true, data });
  },

  // Reviewer rejects with a mandatory note: flow requests are RETURNED for edit +
  // resubmit; legacy single-step requests are terminally REJECTED.
  async rejectOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);
    const data = await overtimeService.reject(tenantId, actor, req.params.id, req.body.note);

    res.json({ success: true, data });
  },

  // Owner withdraws their own still-pending request.
  async cancelOvertime(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const data = await overtimeService.cancel(tenantId, employee.id, req.params.id);

    res.json({ success: true, data });
  },

  // ---- Overtime approval flows ----
  // flowType is forced to OVERTIME here (route-determined, never from the body) so
  // these endpoints can only ever read/write OT flows, never Leave flows.

  async listOvertimeFlows(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await approvalFlowService.getAll(tenantId, ApprovalFlowType.OVERTIME);

    res.json({ success: true, data });
  },

  async getOvertimeFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await approvalFlowService.getById(req.params.id, tenantId, ApprovalFlowType.OVERTIME);

    res.json({ success: true, data });
  },

  async createOvertimeFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.create(tenantId, req.body, ApprovalFlowType.OVERTIME);

    res.status(201).json({ success: true, data: flow });
  },

  async updateOvertimeFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.update(
      req.params.id,
      tenantId,
      req.body,
      ApprovalFlowType.OVERTIME,
    );

    res.json({ success: true, data: flow });
  },

  async replaceOvertimeFlowSteps(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.replaceSteps(
      req.params.id,
      tenantId,
      req.body.steps,
      ApprovalFlowType.OVERTIME,
    );

    res.json({ success: true, data: flow });
  },

  async deleteOvertimeFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await approvalFlowService.remove(req.params.id, tenantId, ApprovalFlowType.OVERTIME);

    res.status(204).send();
  },

  // ---- Summary (the Payroll contract) ----

  // Per-employee/month aggregation. Defaults to the requester's own record; a
  // reviewer may pass ?employeeId= for a teammate, gated server-side: HR (and
  // SUPER_ADMIN) may read anyone, a manager only their direct reports.
  async getSummary(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const self = await requireCurrentEmployee(req);

    const monthRaw = req.query.month;
    if (typeof monthRaw !== 'string' || monthRaw.length === 0) {
      throw new BadRequestError('month is required (YYYY-MM)');
    }

    const requestedId =
      typeof req.query.employeeId === 'string' && req.query.employeeId.length > 0
        ? req.query.employeeId
        : undefined;

    let targetId = self.id;
    if (requestedId && requestedId !== self.id) {
      if (!(await canViewAllAttendance(req))) {
        const reportIds = await employeeRepository.findReportIds(self.id, tenantId);
        if (!reportIds.includes(requestedId)) {
          throw new ForbiddenError('You may only view summaries for yourself or your team');
        }
      }
      targetId = requestedId;
    }

    const data = await timesheetSummaryService.getSummary(tenantId, targetId, monthRaw);
    res.json({ success: true, data });
  },
};

const OVERTIME_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'] as const;
type OvertimeStatusValue = (typeof OVERTIME_STATUSES)[number];

/** Read the shared overtime list filters (status, month, page, limit) off a request. */
function parseOvertimeListQuery(req: Request) {
  const statusRaw = req.query.status;
  const status =
    typeof statusRaw === 'string' && (OVERTIME_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as OvertimeStatusValue)
      : undefined;
  const monthRaw = req.query.month;
  const month = typeof monthRaw === 'string' && monthRaw.length > 0 ? monthRaw : undefined;
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);
  return {
    status,
    month,
    page: Number.isFinite(page) && page > 0 ? page : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  };
}

/** Resolve the authenticated reviewer's direct-report employee ids. */
async function resolveReportIds(req: Request, tenantId: string): Promise<string[]> {
  const reviewer = await requireCurrentEmployee(req);
  return employeeRepository.findReportIds(reviewer.id, tenantId);
}
