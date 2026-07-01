import type { Prisma } from '@prisma/client';
import { spendingPlanRepository } from '../repositories/spending-plan.repository.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../../shared/errors/index.js';
import type {
  SpendingPlanDto,
  SpendingPlanItemInput,
  CreateSpendingPlanRequest,
  UpdateSpendingPlanRequest,
} from '@hrm/shared';
import type { SpendingPlanListInput } from '../../app/validators/spending-plan.validator.js';

// Who is acting: their linked employee (for dept-manager scope) + super-admin bypass.
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
    departmentName: p.department.name,
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

// A manager may act on a department only if they head it (or are super-admin).
async function assertCanManageDept(actor: PlanActor, departmentId: string, tenantId: string): Promise<void> {
  const dept = await db.department.findFirst({ where: { id: departmentId, tenantId } });
  if (!dept) throw new BadRequestError('Bộ phận không hợp lệ', 'PLAN_INVALID_DEPARTMENT');
  if (actor.isSuperAdmin) return;
  if (!actor.employeeId || dept.managerId !== actor.employeeId) {
    throw new ForbiddenError('Bạn chỉ có thể lập kế hoạch cho bộ phận mình phụ trách', 'PLAN_DEPT_FORBIDDEN');
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

    // scope=all is HR/Founder only (gated by controller); otherwise restrict to the
    // departments this manager heads.
    if (query.scope !== 'all') {
      const deptIds = actor.employeeId ? await spendingPlanRepository.managedDepartmentIds(actor.employeeId, tenantId) : [];
      where.departmentId = query.departmentId && deptIds.includes(query.departmentId) ? query.departmentId : { in: deptIds };
    }
    const rows = await spendingPlanRepository.findMany(tenantId, where);
    return rows.map(toDto);
  },

  async getById(id: string, tenantId: string, actor: PlanActor, canReviewAll: boolean): Promise<SpendingPlanDto> {
    const row = await spendingPlanRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    if (!actor.isSuperAdmin && !canReviewAll) {
      const deptIds = actor.employeeId ? await spendingPlanRepository.managedDepartmentIds(actor.employeeId, tenantId) : [];
      if (!deptIds.includes(row.departmentId)) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    }
    return toDto(row);
  },

  async create(tenantId: string, actor: PlanActor, input: CreateSpendingPlanRequest): Promise<SpendingPlanDto> {
    await assertCanManageDept(actor, input.departmentId, tenantId);
    await assertEntity(input.issuingEntityId, tenantId);
    const { data, total } = await buildItems(input.items, tenantId, input.period);

    try {
      const created = await db.spendingPlan.create({
        data: {
          tenantId,
          departmentId: input.departmentId,
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
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictError('Bộ phận đã có kế hoạch cho kỳ này (theo pháp nhân)', 'PLAN_DUPLICATE');
      }
      throw err;
    }
  },

  async update(id: string, tenantId: string, actor: PlanActor, input: UpdateSpendingPlanRequest): Promise<SpendingPlanDto> {
    const existing = await spendingPlanRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    await assertCanManageDept(actor, existing.departmentId, tenantId);
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

  async submit(id: string, tenantId: string, actor: PlanActor): Promise<SpendingPlanDto> {
    const existing = await spendingPlanRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy kế hoạch chi');
    await assertCanManageDept(actor, existing.departmentId, tenantId);
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
