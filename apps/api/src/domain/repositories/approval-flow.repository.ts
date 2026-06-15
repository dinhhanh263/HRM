import { db } from '../../infrastructure/database/client.js';
import { ApprovalFlowType } from '@prisma/client';
import type { Prisma, ApproverType } from '@prisma/client';

/** A normalized step ready to persist (stepOrder assigned, irrelevant fields nulled). */
export interface ApprovalStepData {
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null;
}

const flowInclude = {
  steps: {
    orderBy: { stepOrder: 'asc' },
    include: {
      approver: { select: { id: true, fullName: true, employeeCode: true } },
    },
  },
  department: { select: { name: true } },
} satisfies Prisma.ApprovalFlowInclude;

export const approvalFlowRepository = {
  // flowType discriminates Leave vs Overtime flows; defaults to LEAVE so existing
  // Leave callers are unaffected. OT callers pass OVERTIME to scope every query.
  async findAll(tenantId: string, flowType: ApprovalFlowType = ApprovalFlowType.LEAVE) {
    return db.approvalFlow.findMany({
      where: { tenantId, flowType },
      include: flowInclude,
      // Default flow (departmentId null) sorts first, then by name.
      orderBy: [{ departmentId: 'asc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string, flowType: ApprovalFlowType = ApprovalFlowType.LEAVE) {
    return db.approvalFlow.findFirst({ where: { id, tenantId, flowType }, include: flowInclude });
  },

  // departmentId null = the tenant default flow. Postgres treats NULLs as distinct,
  // so this lookup (not the DB unique) is what enforces a single default per tenant/flowType.
  async findByDepartment(
    tenantId: string,
    departmentId: string | null,
    excludeId?: string,
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ) {
    return db.approvalFlow.findFirst({
      where: {
        tenantId,
        departmentId,
        flowType,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  },

  async create(
    tenantId: string,
    data: { departmentId: string | null; name: string; active: boolean },
    steps: ApprovalStepData[],
    flowType: ApprovalFlowType = ApprovalFlowType.LEAVE,
  ) {
    return db.$transaction(async (tx) => {
      const flow = await tx.approvalFlow.create({
        data: {
          tenantId,
          departmentId: data.departmentId,
          flowType,
          name: data.name,
          active: data.active,
        },
      });
      if (steps.length) {
        await tx.approvalStep.createMany({
          data: steps.map((s) => ({ ...s, flowId: flow.id })),
        });
      }
      return tx.approvalFlow.findFirstOrThrow({ where: { id: flow.id }, include: flowInclude });
    });
  },

  async update(id: string, tenantId: string, data: Prisma.ApprovalFlowUpdateInput) {
    return db.approvalFlow.update({ where: { id, tenantId }, data, include: flowInclude });
  },

  async replaceSteps(id: string, tenantId: string, steps: ApprovalStepData[]) {
    return db.$transaction(async (tx) => {
      await tx.approvalStep.deleteMany({ where: { flowId: id } });
      if (steps.length) {
        await tx.approvalStep.createMany({
          data: steps.map((s) => ({ ...s, flowId: id })),
        });
      }
      // Bump updatedAt so the flow reflects the step change.
      await tx.approvalFlow.update({ where: { id, tenantId }, data: {} });
      return tx.approvalFlow.findFirstOrThrow({ where: { id, tenantId }, include: flowInclude });
    });
  },

  async delete(id: string, tenantId: string) {
    return db.approvalFlow.delete({ where: { id, tenantId } });
  },
};

export type ApprovalFlowWithRelations = Prisma.ApprovalFlowGetPayload<{
  include: typeof flowInclude;
}>;
