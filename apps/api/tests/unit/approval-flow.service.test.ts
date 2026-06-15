import { describe, it, expect, vi, beforeEach } from 'vitest';

const flowRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByDepartment: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  replaceSteps: vi.fn(),
  delete: vi.fn(),
};
const roleRepo = { findByKey: vi.fn() };
const departmentRepo = { findById: vi.fn() };
const employeeRepo = { findById: vi.fn() };

vi.mock('../../src/domain/repositories/approval-flow.repository.js', () => ({
  approvalFlowRepository: flowRepo,
}));
vi.mock('../../src/domain/repositories/role.repository.js', () => ({
  roleRepository: roleRepo,
}));
vi.mock('../../src/domain/repositories/department.repository.js', () => ({
  departmentRepository: departmentRepo,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepo,
}));

const { approvalFlowService } = await import(
  '../../src/domain/services/approval-flow.service.js'
);

function makeFlow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'flow-1',
    tenantId: 'tenant-1',
    departmentId: null,
    name: 'Luồng mặc định',
    active: true,
    createdAt: now,
    updatedAt: now,
    department: null,
    steps: [
      {
        id: 'step-1',
        flowId: 'flow-1',
        stepOrder: 0,
        approverType: 'MANAGER',
        roleKey: null,
        approverId: null,
        approver: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('approvalFlowService.create', () => {
  it('throws when the target department does not exist', async () => {
    departmentRepo.findById.mockResolvedValue(null);

    await expect(
      approvalFlowService.create('tenant-1', {
        departmentId: 'dept-x',
        name: 'F',
        steps: [{ approverType: 'MANAGER' }],
      }),
    ).rejects.toThrow('Department not found');
    expect(flowRepo.create).not.toHaveBeenCalled();
  });

  it('throws LEAVE_FLOW_DUPLICATE when a flow already exists for the scope', async () => {
    flowRepo.findByDepartment.mockResolvedValue(makeFlow());

    await expect(
      approvalFlowService.create('tenant-1', {
        departmentId: null,
        name: 'Another default',
        steps: [{ approverType: 'MANAGER' }],
      }),
    ).rejects.toMatchObject({ code: 'LEAVE_FLOW_DUPLICATE' });
    expect(flowRepo.create).not.toHaveBeenCalled();
  });

  it('requires at least one step', async () => {
    flowRepo.findByDepartment.mockResolvedValue(null);

    await expect(
      approvalFlowService.create('tenant-1', { departmentId: null, name: 'F', steps: [] }),
    ).rejects.toMatchObject({ code: 'LEAVE_INVALID_STEP' });
  });

  it('rejects a ROLE step whose roleKey is not a tenant role', async () => {
    flowRepo.findByDepartment.mockResolvedValue(null);
    roleRepo.findByKey.mockResolvedValue(null);

    await expect(
      approvalFlowService.create('tenant-1', {
        departmentId: null,
        name: 'F',
        steps: [{ approverType: 'ROLE', roleKey: 'ghost' }],
      }),
    ).rejects.toMatchObject({ code: 'LEAVE_INVALID_STEP' });
    expect(roleRepo.findByKey).toHaveBeenCalledWith('ghost', 'tenant-1');
  });

  it('rejects a SPECIFIC_USER step whose approver is not in the tenant', async () => {
    flowRepo.findByDepartment.mockResolvedValue(null);
    employeeRepo.findById.mockResolvedValue(null);

    await expect(
      approvalFlowService.create('tenant-1', {
        departmentId: null,
        name: 'F',
        steps: [{ approverType: 'SPECIFIC_USER', approverId: 'emp-x' }],
      }),
    ).rejects.toMatchObject({ code: 'LEAVE_INVALID_STEP' });
    expect(employeeRepo.findById).toHaveBeenCalledWith('emp-x', 'tenant-1');
  });

  it('normalizes step order and nulls irrelevant fields, returning a DTO', async () => {
    flowRepo.findByDepartment.mockResolvedValue(null);
    roleRepo.findByKey.mockResolvedValue({ id: 'r1', key: 'hr_manager' });
    flowRepo.create.mockResolvedValue(makeFlow());

    await approvalFlowService.create('tenant-1', {
      departmentId: null,
      name: 'F',
      // MANAGER carries a stray roleKey that must be stripped; ROLE keeps its key.
      steps: [
        { approverType: 'MANAGER', roleKey: 'stray' },
        { approverType: 'ROLE', roleKey: 'hr_manager' },
      ],
    });

    const [, , steps] = flowRepo.create.mock.calls[0];
    expect(steps).toEqual([
      { stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null },
      { stepOrder: 1, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null },
    ]);
  });

  it('maps the created flow to a DTO with ISO string dates', async () => {
    flowRepo.findByDepartment.mockResolvedValue(null);
    flowRepo.create.mockResolvedValue(makeFlow());

    const dto = await approvalFlowService.create('tenant-1', {
      departmentId: null,
      name: 'F',
      steps: [{ approverType: 'MANAGER' }],
    });

    expect(typeof dto.createdAt).toBe('string');
    expect(dto.steps[0].approverType).toBe('MANAGER');
    expect(dto.departmentName).toBeNull();
  });
});

describe('approvalFlowService.update', () => {
  it('throws NotFound when the flow is missing', async () => {
    flowRepo.findById.mockResolvedValue(null);

    await expect(
      approvalFlowService.update('missing', 'tenant-1', { name: 'X' }),
    ).rejects.toThrow('Approval flow not found');
    expect(flowRepo.update).not.toHaveBeenCalled();
  });

  it('updates name and active', async () => {
    flowRepo.findById.mockResolvedValue(makeFlow());
    flowRepo.update.mockResolvedValue(makeFlow({ name: 'Updated', active: false }));

    const dto = await approvalFlowService.update('flow-1', 'tenant-1', {
      name: 'Updated',
      active: false,
    });

    expect(flowRepo.update).toHaveBeenCalledWith('flow-1', 'tenant-1', {
      name: 'Updated',
      active: false,
    });
    expect(dto.name).toBe('Updated');
  });

  it('validates and replaces steps when steps are provided', async () => {
    flowRepo.findById.mockResolvedValue(makeFlow());
    flowRepo.update.mockResolvedValue(makeFlow({ name: 'Updated' }));
    flowRepo.replaceSteps.mockResolvedValue(
      makeFlow({
        name: 'Updated',
        steps: [
          {
            id: 'step-1',
            flowId: 'flow-1',
            stepOrder: 0,
            approverType: 'DEPARTMENT_HEAD',
            roleKey: null,
            approverId: null,
            approver: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      }),
    );

    const dto = await approvalFlowService.update('flow-1', 'tenant-1', {
      name: 'Updated',
      steps: [{ approverType: 'DEPARTMENT_HEAD' }, { approverType: 'MANAGER' }],
    });

    const [, , steps] = flowRepo.replaceSteps.mock.calls[0];
    expect(steps).toEqual([
      { stepOrder: 0, approverType: 'DEPARTMENT_HEAD', roleKey: null, approverId: null },
      { stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: null },
    ]);
    expect(dto.name).toBe('Updated');
  });

  it('does not touch steps when steps are omitted', async () => {
    flowRepo.findById.mockResolvedValue(makeFlow());
    flowRepo.update.mockResolvedValue(makeFlow({ name: 'Updated' }));

    await approvalFlowService.update('flow-1', 'tenant-1', { name: 'Updated' });

    expect(flowRepo.replaceSteps).not.toHaveBeenCalled();
  });
});

describe('approvalFlowService.replaceSteps', () => {
  it('throws NotFound when the flow is missing', async () => {
    flowRepo.findById.mockResolvedValue(null);

    await expect(
      approvalFlowService.replaceSteps('missing', 'tenant-1', [{ approverType: 'MANAGER' }]),
    ).rejects.toThrow('Approval flow not found');
    expect(flowRepo.replaceSteps).not.toHaveBeenCalled();
  });

  it('validates and replaces the steps', async () => {
    flowRepo.findById.mockResolvedValue(makeFlow());
    flowRepo.replaceSteps.mockResolvedValue(makeFlow());

    await approvalFlowService.replaceSteps('flow-1', 'tenant-1', [
      { approverType: 'DEPARTMENT_HEAD' },
      { approverType: 'MANAGER' },
    ]);

    const [, , steps] = flowRepo.replaceSteps.mock.calls[0];
    expect(steps).toEqual([
      { stepOrder: 0, approverType: 'DEPARTMENT_HEAD', roleKey: null, approverId: null },
      { stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: null },
    ]);
  });
});

describe('approvalFlowService.remove', () => {
  it('throws NotFound when the flow is missing', async () => {
    flowRepo.findById.mockResolvedValue(null);

    await expect(approvalFlowService.remove('missing', 'tenant-1')).rejects.toThrow(
      'Approval flow not found',
    );
    expect(flowRepo.delete).not.toHaveBeenCalled();
  });

  it('deletes an existing flow', async () => {
    flowRepo.findById.mockResolvedValue(makeFlow());
    flowRepo.delete.mockResolvedValue(makeFlow());

    await approvalFlowService.remove('flow-1', 'tenant-1');

    expect(flowRepo.delete).toHaveBeenCalledWith('flow-1', 'tenant-1');
  });
});
