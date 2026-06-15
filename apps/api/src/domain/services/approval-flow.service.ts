import {
  approvalFlowRepository,
  type ApprovalStepData,
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

export interface CreateApprovalFlowInput {
  departmentId?: string | null;
  name: string;
  active?: boolean;
  steps: ApprovalStepInput[];
}

export interface UpdateApprovalFlowInput {
  name?: string;
  active?: boolean;
  steps?: ApprovalStepInput[];
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

    const created = await approvalFlowRepository.create(
      tenantId,
      { departmentId, name: input.name, active: input.active ?? true },
      steps,
      flowType,
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

    // Validate steps up front so an invalid step list aborts before any write.
    const normalizedSteps =
      input.steps !== undefined
        ? await validateAndNormalizeSteps(tenantId, input.steps)
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
