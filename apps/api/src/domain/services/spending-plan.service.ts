import type { Prisma } from '@prisma/client';
import { spendingPlanRepository } from '../repositories/spending-plan.repository.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';
import type {
  SpendingPlanDto,
  SpendingPlanItemInput,
  CreateSpendingPlanRequest,
  UpdateSpendingPlanRequest,
} from '@hrm/shared';
import type { SpendingPlanListInput } from '../../app/validators/spending-plan.validator.js';

// Who is acting. SPEC-048 GĐ2': plans are personal proposals — any employee may
// create; only the creator (owner) edits their own; HR/Founder review. `employeeId`
// is used only to default the department to the creator's own.
export interface PlanActor {
  userId: string;
  employeeId: string | null;
  isSuperAdmin: boolean;
}

type PlanRow = Prisma.SpendingPlanGetPayload<{
  include: {
    department: { select: { name: true } };
    issuingEntity: { select: { name: true } };
    items: { include: { category: { select: { name: true } } } };
  };
}>;

function toDto(p: PlanRow): SpendingPlanDto {
  return {
    id: p.id,
    departmentId: p.departmentId,
    departmentName: p.department?.name ?? null,
    issuingEntityId: p.issuingEntityId,
    issuingEntityName: p.issuingEntity.name,
    period: p.period,
    status: p.status,
    totalAmount: p.totalAmount.toString(),
    submittedById: p.submittedById,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    reviewedById: p.reviewedById,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewNote: p.reviewNote,
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    items: p.items.map((it) => ({
      id: it.id,
      categoryId: it.categoryId,
      categoryName: it.category?.name ?? null,
      title: it.title,
      amount: it.amount.toString(),
      expectedDate: it.expectedDate?.toISOString() ?? null,
      note: it.note,
    })),
  };
}

// Resolve the department to tag on the plan: use the one supplied (validated against
// the tenant) or default to the creator's own department; may be null.
async function resolveDepartmentId(
  actor: PlanActor,
  supplied: string | null | undefined,
  tenantId: string,
): Promise<string | null> {
  if (supplied) {
    const dept = await db.department.findFirst({ where: { id: supplied, tenantId } });
    if (!dept) throw new BadRequestError('Bộ phận không hợp lệ', 'PLAN_INVALID_DEPARTMENT');
    return supplied;
  }
  if (actor.employeeId) {
    const emp = await db.employee.findFirst({ where: { id: actor.employeeId, tenantId }, select: { departmentId: true } });
    return emp?.departmentId ?? null;
  }
  return null;
}

// Only the creator may modify their own proposal (super-admin bypass).
function assertOwner(existing: { createdById: string }, actor: PlanActor): void {
  if (actor.isSuperAdmin) return;
  if (existing.createdById !== actor.userId) {
    throw new NotFoundError('Không tìm thấy kế hoạch chi');
  }
}

// Validate items (category kind + tenant, expectedDate within the period) and total up.
async function buildItems(
  items: SpendingPlanItemInput[],
  tenantId: string,
  period: string,
): Promise<{ data: Prisma.SpendingPlanItemCreateManyPlanInput[]; total: number }> {
  const catIds = [...new Set(items.map((i) => i.categoryId).filter((id): id is string => !!id))];
  const cats = catIds.length
    ? await db.financeCategory.findMany({ where: { id: { in: catIds }, tenantId }, select: { id: true, kind: true } })
    : [];
  const catKind = new Map(cats.map((c) => [c.id, c.kind]));

  let total = 0;
  const data = items.map((i) => {
    if (i.categoryId) {
      const kind = catKind.get(i.categoryId);
      if (!kind) throw new BadRequestError('Danh mục không hợp lệ', 'PLAN_INVALID_CATEGORY');
      if (kind !== 'EXPENSE') throw new BadRequestError('Kế hoạch chi chỉ dùng danh mục chi (EXPENSE)', 'PLAN_CATEGORY_NOT_EXPENSE');
    }
    let expectedDate: Date | null = null;
    if (i.expectedDate) {
      const d = new Date(i.expectedDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestError('Ngày dự kiến không hợp lệ', 'PLAN_INVALID_DATE');
      if (i.expectedDate.slice(0, 7) !== period) {
        throw new BadRequestError('Ngày dự kiến phải nằm trong kỳ kế hoạch', 'PLAN_DATE_OUT_OF_PERIOD');
      }
      expectedDate = d;
    }
    total += i.amount;
    return {
      categoryId: i.categoryId ?? null,
      title: i.title.trim(),
      amount: i.amount,
      expectedDate,
      note: i.note?.trim() || null,
    };
  });
  return { data, total };
}

async function assertEntity(issuingEntityId: string, tenantId: string): Promise<void> {
  const e = await db.issuingEntity.findFirst({ where: { id: issuingEntityId, tenantId } });
  if (!e) throw new BadRequestError('Pháp nhân không hợp lệ', 'PLAN_INVALID_ENTITY');
}

export const spendingPlanService = {
  async list(tenantId: string, actor: PlanActor, query: SpendingPlanListInput): Promise<SpendingPlanDto[]> {
    const where: Prisma.SpendingPlanWhereInput = {};
    if (query.period) where.period = query.period;
    if (query.issuingEntityId) where.issuingEntityId = query.issuingEntityId;
    if (query.status) where.status = query.status;
    if (query.departmentId) where.departmentId = query.departmentId;

    // scope=all is HR/Founder only (gated by controller); otherwise a user sees only
    // the proposals they created.
    if (query.scope !== 'all') {
      where.createdById = actor.userId;
    }
    const rows = await spendingPlanRepository.findMany(tenantId, where);
    return rows.map(toDto);
  },

  async getById(id: string, tenantId: string, actor: PlanActor, canReviewAll: boolean): Promise<SpendingPlanDto> {
    const row = await spendingPlanRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    // Owner or a reviewer (HR/Founder) may read; otherwise hide.
    if (!actor.isSuperAdmin && !canReviewAll && row.createdById !== actor.userId) {
      throw new NotFoundError('Không tìm thấy kế hoạch chi');
    }
    return toDto(row);
  },

  async create(tenantId: string, actor: PlanActor, input: CreateSpendingPlanRequest): Promise<SpendingPlanDto> {
    await assertEntity(input.issuingEntityId, tenantId);
    const departmentId = await resolveDepartmentId(actor, input.departmentId, tenantId);
    const { data, total } = await buildItems(input.items, tenantId, input.period);

    const created = await db.spendingPlan.create({
      data: {
        tenantId,
        departmentId,
        issuingEntityId: input.issuingEntityId,
        period: input.period,
        status: 'DRAFT',
        totalAmount: total,
        createdById: actor.userId,
        items: { create: data },
      },
      select: { id: true },
    });
    return this.getById(created.id, tenantId, actor, true);
  },

  async update(id: string, tenantId: string, actor: PlanActor, input: UpdateSpendingPlanRequest): Promise<SpendingPlanDto> {
    const existing = await spendingPlanRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    assertOwner(existing, actor);
    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      throw new ConflictError('Chỉ sửa được kế hoạch ở trạng thái nháp hoặc bị từ chối', 'PLAN_NOT_EDITABLE');
    }

    const period = input.period ?? existing.period;
    if (input.issuingEntityId) await assertEntity(input.issuingEntityId, tenantId);

    await db.$transaction(async (tx) => {
      const data: Prisma.SpendingPlanUncheckedUpdateInput = {};
      if (input.period) data.period = input.period;
      if (input.issuingEntityId) data.issuingEntityId = input.issuingEntityId;
      if (input.items) {
        const { data: itemData, total } = await buildItems(input.items, tenantId, period);
        await tx.spendingPlanItem.deleteMany({ where: { planId: id } });
        await tx.spendingPlanItem.createMany({ data: itemData.map((it) => ({ ...it, planId: id })) });
        data.totalAmount = total;
      }
      await tx.spendingPlan.update({ where: { id }, data });
    });
    return this.getById(id, tenantId, actor, true);
  },

  // HR/Finance decision on a SUBMITTED plan. Reject requires a note and returns the
  // plan to REJECTED so the owner can revise & resubmit; approve locks it APPROVED.
  async review(
    id: string,
    tenantId: string,
    actor: PlanActor,
    decision: 'APPROVED' | 'REJECTED',
    note: string | null | undefined,
  ): Promise<SpendingPlanDto> {
    const existing = await spendingPlanRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    if (existing.status !== 'SUBMITTED') {
      throw new ConflictError('Chỉ duyệt được kế hoạch đang chờ duyệt', 'PLAN_NOT_REVIEWABLE');
    }
    if (decision === 'REJECTED' && !note?.trim()) {
      throw new BadRequestError('Cần nêu lý do khi từ chối', 'PLAN_REJECT_NOTE_REQUIRED');
    }
    await db.spendingPlan.update({
      where: { id },
      data: {
        status: decision,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
    return this.getById(id, tenantId, actor, true);
  },

  async submit(id: string, tenantId: string, actor: PlanActor): Promise<SpendingPlanDto> {
    const existing = await spendingPlanRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    assertOwner(existing, actor);
    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      throw new ConflictError('Chỉ gửi được kế hoạch ở trạng thái nháp hoặc bị từ chối', 'PLAN_NOT_SUBMITTABLE');
    }
    if (existing.items.length === 0) throw new BadRequestError('Kế hoạch cần ít nhất một khoản chi', 'PLAN_EMPTY');
    await db.spendingPlan.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedById: actor.userId, submittedAt: new Date(), reviewNote: null },
    });
    return this.getById(id, tenantId, actor, true);
  },
};
