import type { Request, Response } from 'express';
import { leaveTypeService } from '../../domain/services/leave-type.service.js';
import { leaveRequestService } from '../../domain/services/leave-request.service.js';
import { leaveBalanceService } from '../../domain/services/leave-balance.service.js';
import { employeeService } from '../../domain/services/employee.service.js';
import { leaveSettingsService } from '../../domain/services/leave-settings.service.js';
import { approvalFlowService } from '../../domain/services/approval-flow.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { roleRepository } from '../../domain/repositories/role.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import type { ApprovalActor } from '../../domain/leave/approval-routing.helper.js';
import { BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import {
  leaveTypeQuerySchema,
  leaveRequestQuerySchema,
  leaveBalanceQuerySchema,
  leaveRosterQuerySchema,
  leaveRosterExportQuerySchema,
  setLeaveBalanceSchema,
  updateLeaveSettingsSchema,
} from '../validators/leave.validator.js';
import { buildRosterWorkbook } from '../../domain/services/leave-roster-export.js';
import type { LeaveBalanceDto, LeaveBalanceRosterRowDto } from '@hrm/shared';

type RosterEmployee = Awaited<ReturnType<typeof employeeService.getAll>>['data'][number];

/** Map an in-scope employee + its computed balances into one roster row. Shared by
 *  the JSON view (getRoster) and the .xlsx export (exportRoster). */
function toRosterRow(
  e: RosterEmployee,
  balancesByEmployee: Map<string, LeaveBalanceDto[]>,
): LeaveBalanceRosterRowDto {
  return {
    employee: {
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      avatar: e.avatar,
      departmentName: e.department?.name ?? null,
    },
    balances: balancesByEmployee.get(e.id) ?? [],
  };
}

/** Resolve the Employee linked to the authenticated user, or null (e.g. tenant admins). */
async function resolveCurrentEmployee(req: Request) {
  return employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
}

async function requireCurrentEmployee(req: Request) {
  const employee = await resolveCurrentEmployee(req);
  if (!employee) {
    throw new BadRequestError('No employee profile is linked to your account');
  }
  return employee;
}

/**
 * Guard for actions that read other employees' requests/balances (review scope,
 * explicit employeeId). The route only checks `leave:view`, which every role has —
 * so reviewing across the tenant must additionally require approve/reject here.
 * SUPER_ADMIN is implicit-all.
 */
/**
 * Build the actor that the per-step approval engine needs: the reviewer's
 * employee id (null for profile-less admins), their role key (for ROLE-step
 * capability matching), and whether they are SUPER_ADMIN (implicit-all).
 */
async function buildApprovalActor(req: Request): Promise<ApprovalActor> {
  const user = req.user!;
  const employee = await resolveCurrentEmployee(req);
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

async function requireReviewCapability(req: Request) {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return;
  }
  if (!user.roleId) {
    throw new ForbiddenError('You do not have permission to review leave requests');
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  if (!granted.has('leave:approve') && !granted.has('leave:reject')) {
    throw new ForbiddenError('You do not have permission to review leave requests');
  }
}

export const leaveController = {
  // ---- Leave types ----

  async listTypes(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { activeOnly } = leaveTypeQuerySchema.parse(req.query);

    const data = await leaveTypeService.getAll(tenantId, { activeOnly });

    res.json({ success: true, data });
  },

  async createType(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const leaveType = await leaveTypeService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: leaveType });
  },

  async updateType(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const leaveType = await leaveTypeService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: leaveType });
  },

  async deleteType(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await leaveTypeService.remove(req.params.id, tenantId);

    res.status(204).send();
  },

  // ---- Leave requests ----

  async listRequests(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { page, limit, ...input } = leaveRequestQuerySchema.parse(req.query);

    // 'all' spans the whole tenant; 'review' is the caller's current-step queue.
    // Both are gated by approve/reject capability and need no employee profile.
    if (input.scope === 'all') {
      await requireReviewCapability(req);
      const result = await leaveRequestService.list(tenantId, '', input, { page, limit });
      res.json({ success: true, data: result.data, pagination: result.pagination });
      return;
    }
    if (input.scope === 'review') {
      await requireReviewCapability(req);
      const actor = await buildApprovalActor(req);
      const result = await leaveRequestService.listReview(tenantId, actor, input, { page, limit });
      res.json({ success: true, data: result.data, pagination: result.pagination });
      return;
    }
    // SPEC-046: 'watching' is the CC queue — needs only leave:view (route-gated),
    // never approve/reject. Returns view-only rows the actor is a watcher of.
    if (input.scope === 'watching') {
      const actor = await buildApprovalActor(req);
      const result = await leaveRequestService.listWatched(tenantId, actor, input, { page, limit });
      res.json({ success: true, data: result.data, pagination: result.pagination });
      return;
    }

    // 'mine' scope: a user without a linked employee profile (e.g. a tenant admin)
    // simply has no personal requests — return an empty list, not an error.
    const employee = await resolveCurrentEmployee(req);
    if (!employee) {
      res.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      return;
    }

    const result = await leaveRequestService.list(tenantId, employee.id, input, { page, limit });

    res.json({ success: true, data: result.data, pagination: result.pagination });
  },

  async getRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const request = await leaveRequestService.getById(req.params.id, tenantId);

    // Owners always see their own request. For anyone else, allow if they are a
    // CC/watcher of the request's flow (SPEC-046, view-only) — otherwise require
    // review capability. Watchers with only leave:view can thus follow the request.
    const employee = await resolveCurrentEmployee(req);
    if (!employee || request.employeeId !== employee.id) {
      const actor = await buildApprovalActor(req);
      const watching = await leaveRequestService.isWatcherOf(req.params.id, tenantId, actor);
      if (watching) {
        res.json({ success: true, data: { ...request, watchOnly: true } });
        return;
      }
      await requireReviewCapability(req);
    }

    res.json({ success: true, data: request });
  },

  async createRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);

    const request = await leaveRequestService.create(tenantId, employee.id, req.body);

    res.status(201).json({ success: true, data: request });
  },

  async resubmitRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);

    const request = await leaveRequestService.resubmit(req.params.id, tenantId, employee.id, req.body);

    res.json({ success: true, data: request });
  },

  async cancelRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);

    const request = await leaveRequestService.cancel(req.params.id, tenantId, employee.id);

    res.json({ success: true, data: request });
  },

  async approveRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);

    const request = await leaveRequestService.approve(req.params.id, tenantId, actor);

    res.json({ success: true, data: request });
  },

  async rejectRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);

    const request = await leaveRequestService.reject(req.params.id, tenantId, actor, req.body.note);

    res.json({ success: true, data: request });
  },

  // ---- Approval flows ----

  async listFlows(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await approvalFlowService.getAll(tenantId);

    res.json({ success: true, data });
  },

  async getFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await approvalFlowService.getById(req.params.id, tenantId);

    res.json({ success: true, data });
  },

  async createFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: flow });
  },

  async updateFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: flow });
  },

  async replaceFlowSteps(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.replaceSteps(req.params.id, tenantId, req.body.steps);

    res.json({ success: true, data: flow });
  },

  // SPEC-046: replace the CC/watcher list of a flow.
  async replaceFlowWatchers(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const flow = await approvalFlowService.replaceWatchers(
      req.params.id,
      tenantId,
      req.body.watchers,
    );

    res.json({ success: true, data: flow });
  },

  async deleteFlow(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await approvalFlowService.remove(req.params.id, tenantId);

    res.status(204).send();
  },

  // ---- Balances ----

  async getBalances(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { year, employeeId } = leaveBalanceQuerySchema.parse(req.query);
    const targetYear = year ?? new Date().getUTCFullYear();

    // An explicit employeeId means viewing someone else's balances → requires
    // review capability (the route only checks leave:view, which everyone has).
    if (employeeId) {
      await requireReviewCapability(req);
      const data = await leaveBalanceService.getBalances(tenantId, employeeId, targetYear);
      res.json({ success: true, data });
      return;
    }

    // Otherwise return the caller's own balances; a user with no employee profile
    // has none — return an empty list rather than erroring.
    const employee = await resolveCurrentEmployee(req);
    if (!employee) {
      res.json({ success: true, data: [] });
      return;
    }

    const data = await leaveBalanceService.getBalances(tenantId, employee.id, targetYear);

    res.json({ success: true, data });
  },

  /**
   * Company-wide / team leave balance roster: one row per (active) employee,
   * columns are active leave types. The employee set — and its row-level scope
   * (HR/Admin = whole tenant, MANAGER = self + direct reports) — is delegated to
   * employeeService.getAll, so this view never reimplements scoping. Reading
   * other employees' balances additionally requires review capability.
   */
  async getRoster(req: Request, res: Response) {
    await requireReviewCapability(req);

    const tenantId = req.user!.tenantId;
    const { page, limit, year, departmentId, search } = leaveRosterQuerySchema.parse(req.query);
    const targetYear = year ?? new Date().getUTCFullYear();

    const requester = { userId: req.user!.sub, role: req.user!.role };
    const { data: employees, pagination } = await employeeService.getAll(
      tenantId,
      { status: 'ACTIVE', departmentId, search, sort: 'fullName', order: 'asc' },
      { page, limit },
      requester,
    );

    const { leaveTypes, balancesByEmployee } = await leaveBalanceService.getRosterBalances(
      tenantId,
      employees.map((e) => e.id),
      targetYear,
    );

    const data = employees.map((e) => toRosterRow(e, balancesByEmployee));

    res.json({ success: true, data, leaveTypes, pagination });
  },

  /**
   * Stream the roster as an .xlsx download. Same scope rules as getRoster
   * (review capability + employeeService.getAll row-level scoping), but it walks
   * every page so the workbook holds the full in-scope set, not just one page.
   */
  async exportRoster(req: Request, res: Response) {
    await requireReviewCapability(req);

    const tenantId = req.user!.tenantId;
    const { year, departmentId, search } = leaveRosterExportQuerySchema.parse(req.query);
    const targetYear = year ?? new Date().getUTCFullYear();

    const requester = { userId: req.user!.sub, role: req.user!.role };
    const filters = {
      status: 'ACTIVE' as const,
      departmentId,
      search,
      sort: 'fullName' as const,
      order: 'asc' as const,
    };

    // Page through the in-scope employees (bounded page size) to avoid an
    // unbounded single query while still collecting everyone for the export.
    const PAGE_SIZE = 200;
    const employees: Awaited<ReturnType<typeof employeeService.getAll>>['data'] = [];
    for (let page = 1; ; page++) {
      const { data, pagination } = await employeeService.getAll(
        tenantId,
        filters,
        { page, limit: PAGE_SIZE },
        requester,
      );
      employees.push(...data);
      if (page >= pagination.totalPages || data.length === 0) {
        break;
      }
    }

    const { leaveTypes, balancesByEmployee } = await leaveBalanceService.getRosterBalances(
      tenantId,
      employees.map((e) => e.id),
      targetYear,
    );

    const rows = employees.map((e) => toRosterRow(e, balancesByEmployee));

    const buffer = await buildRosterWorkbook(rows, leaveTypes, targetYear);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="leave-balances-${targetYear}.xlsx"`,
    );
    res.send(buffer);
  },

  /** Set an HR-defined allocation override (gated by leave:configure on the route). */
  async setBalance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { employeeId, leaveTypeId, year, allocated } = setLeaveBalanceSchema.parse(req.body);

    const data = await leaveBalanceService.setAllocation(
      tenantId,
      employeeId,
      leaveTypeId,
      year,
      allocated,
    );

    res.json({ success: true, data });
  },

  // ---- Settings (tenant-level leave config) ----

  /** Read the tenant's leave settings (gated by leave:configure on the route). */
  async getSettings(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await leaveSettingsService.getProRata(tenantId);

    res.json({ success: true, data });
  },

  /** Update the tenant's leave settings (gated by leave:configure on the route). */
  async updateSettings(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { proRataEnabled } = updateLeaveSettingsSchema.parse(req.body);

    const data = await leaveSettingsService.setProRata(tenantId, proRataEnabled);

    res.json({ success: true, data });
  },
};
