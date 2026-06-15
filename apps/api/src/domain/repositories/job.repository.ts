import type { Prisma, JobStatus, StageType, HiringTeamRole } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface JobStageSeed {
  name: string;
  order: number;
  type: Prisma.JobStageCreateManyJobInput['type'];
}

export interface CreateJobData {
  tenantId: string;
  createdById: string;
  title: string;
  description?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  employmentType: Prisma.JobCreateInput['employmentType'];
  location?: string | null;
  headcount: number;
  status: Extract<JobStatus, 'DRAFT' | 'OPEN'>;
  stages: JobStageSeed[];
}

export interface UpdateJobData {
  title?: string;
  description?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  employmentType?: Prisma.JobUpdateInput['employmentType'];
  location?: string | null;
  headcount?: number;
}

export interface JobListFilters {
  search?: string;
  status?: JobStatus;
  departmentId?: string;
}

const listInclude = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  _count: {
    select: {
      stages: true,
      applications: { where: { status: 'ACTIVE' } },
    },
  },
} satisfies Prisma.JobInclude;

const detailInclude = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  stages: { orderBy: { order: 'asc' } },
  hiringTeam: {
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          avatar: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
    orderBy: { employee: { fullName: 'asc' } },
  },
  _count: {
    select: {
      stages: true,
      applications: { where: { status: 'ACTIVE' } },
    },
  },
} satisfies Prisma.JobInclude;

const hiringTeamMemberInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      avatar: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
} satisfies Prisma.JobHiringTeamInclude;

export interface ReorderStagesPlan {
  removedIds: string[];
  updates: { id: string; name: string; order: number; type: StageType }[];
  creates: { name: string; order: number; type: StageType }[];
}

// Temp offset to dodge the @@unique([jobId, order]) constraint while reordering.
const ORDER_OFFSET = 100000;

export const jobRepository = {
  async findAll(tenantId: string, filters: JobListFilters) {
    const where: Prisma.JobWhereInput = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }
    return db.job.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.job.findFirst({ where: { id, tenantId }, include: detailInclude });
  },

  async create(data: CreateJobData) {
    return db.job.create({
      data: {
        tenantId: data.tenantId,
        createdById: data.createdById,
        title: data.title,
        description: data.description ?? null,
        departmentId: data.departmentId ?? null,
        positionId: data.positionId ?? null,
        employmentType: data.employmentType,
        location: data.location ?? null,
        headcount: data.headcount,
        status: data.status,
        openedAt: data.status === 'OPEN' ? new Date() : null,
        stages: { create: data.stages },
      },
      include: detailInclude,
    });
  },

  async update(id: string, data: UpdateJobData) {
    return db.job.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
        ...(data.positionId !== undefined ? { positionId: data.positionId } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.headcount !== undefined ? { headcount: data.headcount } : {}),
      },
      include: detailInclude,
    });
  },

  async updateStatus(
    id: string,
    data: { status: JobStatus; openedAt?: Date | null; closedAt?: Date | null }
  ) {
    return db.job.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.openedAt !== undefined ? { openedAt: data.openedAt } : {}),
        ...(data.closedAt !== undefined ? { closedAt: data.closedAt } : {}),
      },
      include: detailInclude,
    });
  },

  // ===== Stages =====

  // Per-stage usage so the service can block deleting a stage that is referenced
  // by any application (current stage) or by stage-movement history.
  async findStagesWithUsage(jobId: string) {
    return db.jobStage.findMany({
      where: { jobId },
      select: {
        id: true,
        type: true,
        _count: { select: { applications: true, fromHistory: true, toHistory: true } },
      },
    });
  },

  // Reconcile the full stage list atomically. Existing rows are first parked at a
  // high temp order so final orders never collide with the unique constraint.
  async reorderStages(jobId: string, plan: ReorderStagesPlan) {
    await db.$transaction(async (tx) => {
      const existing = await tx.jobStage.findMany({ where: { jobId }, select: { id: true } });
      for (let i = 0; i < existing.length; i += 1) {
        await tx.jobStage.update({
          where: { id: existing[i].id },
          data: { order: ORDER_OFFSET + i },
        });
      }
      if (plan.removedIds.length) {
        await tx.jobStage.deleteMany({ where: { id: { in: plan.removedIds }, jobId } });
      }
      for (const u of plan.updates) {
        await tx.jobStage.update({
          where: { id: u.id },
          data: { name: u.name, order: u.order, type: u.type },
        });
      }
      if (plan.creates.length) {
        await tx.jobStage.createMany({
          data: plan.creates.map((c) => ({ jobId, name: c.name, order: c.order, type: c.type })),
        });
      }
    });
  },

  // ===== Hiring team =====

  async findHiringTeamMember(jobId: string, memberId: string) {
    return db.jobHiringTeam.findFirst({ where: { id: memberId, jobId } });
  },

  async findHiringTeamMemberByEmployee(jobId: string, employeeId: string) {
    return db.jobHiringTeam.findFirst({ where: { jobId, employeeId } });
  },

  async addHiringTeamMember(jobId: string, employeeId: string, teamRole: HiringTeamRole) {
    return db.jobHiringTeam.create({
      data: { jobId, employeeId, teamRole },
      include: hiringTeamMemberInclude,
    });
  },

  async updateHiringTeamMember(memberId: string, teamRole: HiringTeamRole) {
    return db.jobHiringTeam.update({
      where: { id: memberId },
      data: { teamRole },
      include: hiringTeamMemberInclude,
    });
  },

  async deleteHiringTeamMember(memberId: string) {
    await db.jobHiringTeam.delete({ where: { id: memberId } });
  },
};
