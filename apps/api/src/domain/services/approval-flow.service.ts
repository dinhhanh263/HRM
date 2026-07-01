import {
  approvalFlowRepository,
  type ApprovalStepData,
  type ApprovalWatcherData,
} from '../repositories/approval-flow.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { departmentRepository } from '../repositories/department.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { toApprovalFlowDto } from '../leave/mappers.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/index.js';
import { ApprovalFlowType } from '@prisma/client';
import type { ApprovalFlowDto, ApproverType } from '@hrm/shared';

export interface ApprovalStepInput {
  approverType: ApproverType;
  roleKey?: string | null;
  approverId?: string | null;
}

// SPEC-046: CC/watcher input — chỉ ROLE | SPECIFIC_USER.
export interface WatcherInput {
  watcherType: 'ROLE' | 'SPECIFIC_USER';
  roleKey?: string | null;
  watcherId?: string | null;
}

export interface CreateApprovalFlowInput {
  departmentId?: string | null;
  name: string;
  active?: boolean;
  steps: ApprovalStepInput[];
  watchers?: WatcherInput[];
}

export interface UpdateApprovalFlowInput {
  name?: string;
  active?: boolean;
  steps?: ApprovalStepInput[];
  watchers?: WatcherInput[];
}

/**
 * Validate the step list against tenant data and normalize it to persistable
 * rows: stepOrder is assigned by array position, and fields irrelevant to the
 * approver type are nulled out (e.g. a MANAGER step never keeps a roleKey).
 */
async function validateAndNormalizeSteps(
  tenantId: string,
  steps: ApprovalStepInput[],
): Promise<ApprovalStepData[]> {
  if (!steps || steps.length === 0) {
    throw new BadRequestError('An approval flow needs at least one step', 'LEAVE_INVALID_STEP');
  }

  const normalized: ApprovalStepData[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let roleKey: string | null = null;
    let approverId: string | null = null;

    if (step.approverType === 'ROLE') {
      if (!step.roleKey) {
        throw new BadRequestError('A ROLE step requires a roleKey', 'LEAVE_INVALID_STEP');
      }
      const role = await roleRepository.findByKey(step.roleKey, tenantId);
      if (!role) {
        throw new BadRequestError(
          `Role "${step.roleKey}" does not exist in this tenant`,
          'LEAVE_INVALID_STEP',
        );
      }
      roleKey = step.roleKey;
    } else if (step.approverType === 'SPECIFIC_USER') {
      if (!step.approverId) {
        throw new BadRequestError(
          'A SPECIFIC_USER step requires an approverId',
          'LEAVE_INVALID_STEP',
        );
      }
      const employee = await employeeRepository.findById(step.approverId, tenantId);
      if (!employee) {
        throw new BadRequestError(
          'The selected approver is not an employee in this tenant',
          'LEAVE_INVALID_STEP',
        );
      }
      approverId = step.approverId;
    }

    normalized.push({ stepOrder: i, approverType: step.approverType, roleKey, approverId });
  }

  return normalized;
}

/**
 * SPEC-046: validate the CC/watcher list against tenant data and normalize to
 * persistable rows. Watchers are view-only (never in the approval step chain);
 * only ROLE and SPECIFIC_USER types are supported.
 */
async function validateAndNormalizeWatchers(
  tenantId: string,
  watchers: WatcherInput[],
): Promise<ApprovalWatcherData[]> {
  const normalized: ApprovalWatcherData[] = [];

  for (const watcher of watchers) {
    let roleKey: string | null = null;
    let watcherId: string | null = null;

    if (watcher.watcherType === 'ROLE') {
      if (!watcher.roleKey) {
        throw new BadRequestError('A ROLE watcher requires a roleKey', 'LEAVE_INVALID_WATCHER');
      }
      const role = await roleRepository.findByKey(watcher.roleKey, tenantId);
      if (!role) {
        throw new BadRequestError(
          `Role "${watcher.roleKey}" does not exist in this tenant`,
          'LEAVE_INVALID_WATCHER',
        );
      }
      roleKey = watcher.roleKey;
    } else if (watcher.watcherType === 'SPECIFIC_USER') {
      if (!watcher.watcherId) {
        throw new BadRequestError(
          'A SPECIFIC_USER watcher requires a watcherId',
          'LEAVE_INVALID_WATCHER',
        );
      }
      const employee = await employeeRepository.findById(watcher.watcherId, tenantId);
      if (!employee) {
        throw new BadRequestError(
          'The selected watcher is not an employee in this tenant',
          'LEAVE_INVALID_WATCHER',
        );
      }
      watcherId = watcher.watcherId;
    } else {
      throw new BadRequestError('Unsupported watcher type', 'LEAVE_INVALID_WATCHER');
    }

    normalized.push({ watcherType: watcher.watcherType, roleKey, watcherId });
  }

  return normalized;
}

export const approvalFlowService = {
  async getAll(
    tenantId: string,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto[]> {
    const flows = await approvalFlowRepository.findAll(tenantId, flowType);
    return flows.map(toApprovalFlowDto);
  },

  async getById(
    id: string,
    tenantId: string,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto> {
    const flow = await approvalFlowRepository.findById(id, tenantId, flowType);
    if (!flow) {
      throw new NotFoundError('Approval flow not found');
    }
    return toApprovalFlowDto(flow);
  },

  async create(
    tenantId: string,
    input: CreateApprovalFlowInput,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto> {
    const departmentId = input.departmentId ?? null;

    if (departmentId) {
      const department = await departmentRepository.findById(departmentId, tenantId);
      if (!department) {
        throw new NotFoundError('Department not found');
      }
    }

    const existing = await approvalFlowRepository.findByDepartment(
      tenantId,
      departmentId,
      undefined,
      flowType,
    );
    if (existing) {
      throw new ConflictError(
        departmentId
          ? 'An approval flow already exists for this department'
          : 'A default approval flow already exists for this tenant',
        'LEAVE_FLOW_DUPLICATE',
      );
    }

    const steps = await validateAndNormalizeSteps(tenantId, input.steps);
    const watchers = input.watchers
      ? await validateAndNormalizeWatchers(tenantId, input.watchers)
      : [];

    const created = await approvalFlowRepository.create(
      tenantId,
      { departmentId, name: input.name, active: input.active ?? true },
      steps,
      flowType,
      watchers,
    );

    return toApprovalFlowDto(created);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateApprovalFlowInput,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto> {
    const existing = await approvalFlowRepository.findById(id, tenantId, flowType);
    if (!existing) {
      throw new NotFoundError('Approval flow not found');
    }

    // Validate steps + watchers up front so an invalid list aborts before any write.
    const normalizedSteps =
      input.steps !== undefined
        ? await validateAndNormalizeSteps(tenantId, input.steps)
        : undefined;
    const normalizedWatchers =
      input.watchers !== undefined
        ? await validateAndNormalizeWatchers(tenantId, input.watchers)
        : undefined;

    let updated = existing;

    if (input.name !== undefined || input.active !== undefined) {
      updated = await approvalFlowRepository.update(id, tenantId, {
        name: input.name,
        active: input.active,
      });
    }

    if (normalizedSteps) {
      updated = await approvalFlowRepository.replaceSteps(id, tenantId, normalizedSteps);
    }

    if (normalizedWatchers !== undefined) {
      updated = await approvalFlowRepository.replaceWatchers(id, tenantId, normalizedWatchers);
    }

    return toApprovalFlowDto(updated);
  },

  async replaceSteps(
    id: string,
    tenantId: string,
    steps: ApprovalStepInput[],
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto> {
    const existing = await approvalFlowRepository.findById(id, tenantId, flowType);
    if (!existing) {
      throw new NotFoundError('Approval flow not found');
    }

    const normalized = await validateAndNormalizeSteps(tenantId, steps);
    const updated = await approvalFlowRepository.replaceSteps(id, tenantId, normalized);

    return toApprovalFlowDto(updated);
  },

  // SPEC-046: replace the flow's CC/watcher list (empty = clear all).
  async replaceWatchers(
    id: string,
    tenantId: string,
    watchers: WatcherInput[],
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<ApprovalFlowDto> {
    const existing = await approvalFlowRepository.findById(id, tenantId, flowType);
    if (!existing) {
      throw new NotFoundError('Approval flow not found');
    }

    const normalized = await validateAndNormalizeWatchers(tenantId, watchers);
    const updated = await approvalFlowRepository.replaceWatchers(id, tenantId, normalized);

    return toApprovalFlowDto(updated);
  },

  async remove(
    id: string,
    tenantId: string,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ): Promise<void> {
    const existing = await approvalFlowRepository.findById(id, tenantId, flowType);
    if (!existing) {
      throw new NotFoundError('Approval flow not found');
    }
    await approvalFlowRepository.delete(id, tenantId);
  },
};
