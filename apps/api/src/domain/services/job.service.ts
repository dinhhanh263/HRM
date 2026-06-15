import type {
  Job,
  JobStage,
  JobStatus,
  StageType,
  HiringTeamRole,
  Department,
  Position,
} from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import {
  jobRepository,
  type JobListFilters,
  type ReorderStagesPlan,
} from '../repositories/job.repository.js';
import { pipelineTemplateRepository } from '../repositories/pipeline-template.repository.js';
import { departmentRepository } from '../repositories/department.repository.js';
import { positionRepository } from '../repositories/position.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';

type JobRefDept = Pick<Department, 'id' | 'name'> | null;
type JobRefPos = Pick<Position, 'id' | 'name'> | null;

type JobWithCounts = Job & {
  department: JobRefDept;
  position: JobRefPos;
  _count: { stages: number; applications: number };
};

type HiringTeamMemberWithEmployee = {
  id: string;
  employeeId: string;
  teamRole: HiringTeamRole;
  employee: {
    id: string;
    fullName: string;
    avatar: string | null;
    department: { name: string } | null;
    position: { name: string } | null;
  };
};

type JobDetail = JobWithCounts & {
  stages: JobStage[];
  hiringTeam: HiringTeamMemberWithEmployee[];
};

// Allowed status transitions. CANCELLED is terminal. A job can be reopened from
// ON_HOLD or CLOSED back to OPEN.
const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'CLOSED', 'CANCELLED'],
  CLOSED: ['OPEN', 'CANCELLED'],
  CANCELLED: [],
};

function toListDto(job: JobWithCounts) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    employmentType: job.employmentType,
    location: job.location,
    headcount: job.headcount,
    departmentId: job.departmentId,
    positionId: job.positionId,
    department: job.department ? { id: job.department.id, name: job.department.name } : null,
    position: job.position ? { id: job.position.id, name: job.position.name } : null,
    stageCount: job._count.stages,
    activeApplicationCount: job._count.applications,
    openedAt: job.openedAt?.toISOString() ?? null,
    closedAt: job.closedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toHiringTeamMemberDto(m: HiringTeamMemberWithEmployee) {
  return {
    id: m.id,
    employeeId: m.employeeId,
    teamRole: m.teamRole,
    employee: {
      id: m.employee.id,
      fullName: m.employee.fullName,
      avatar: m.employee.avatar,
      department: m.employee.department ? { name: m.employee.department.name } : null,
      position: m.employee.position ? { name: m.employee.position.name } : null,
    },
  };
}

function toDetailDto(job: JobDetail) {
  return {
    ...toListDto(job),
    tenantId: job.tenantId,
    description: job.description,
    stages: job.stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      type: s.type,
    })),
    hiringTeam: job.hiringTeam.map(toHiringTeamMemberDto),
  };
}

async function assertRefs(tenantId: string, departmentId?: string | null, positionId?: string | null) {
  if (departmentId) {
    const dept = await departmentRepository.findById(departmentId, tenantId);
    if (!dept) throw new NotFoundError('Department not found');
  }
  if (positionId) {
    const pos = await positionRepository.findById(positionId, tenantId);
    if (!pos) throw new NotFoundError('Position not found');
  }
}

export const jobService = {
  async getAll(tenantId: string, filters: JobListFilters) {
    const jobs = await jobRepository.findAll(tenantId, filters);
    return jobs.map(toListDto);
  },

  async getById(id: string, tenantId: string) {
    const job = await jobRepository.findById(id, tenantId);
    if (!job) throw new NotFoundError('Job not found');
    return toDetailDto(job);
  },

  async create(
    tenantId: string,
    userId: string,
    data: {
      title: string;
      description?: string;
      departmentId?: string;
      positionId?: string;
      employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
      location?: string;
      headcount?: number;
      pipelineTemplateId: string;
      status?: 'DRAFT' | 'OPEN';
    }
  ) {
    const creator = await employeeRepository.findByUserId(userId, tenantId);
    if (!creator) {
      throw new ValidationError('Current user has no employee profile to own the job');
    }

    await assertRefs(tenantId, data.departmentId, data.positionId);

    const template = await pipelineTemplateRepository.findById(data.pipelineTemplateId, tenantId);
    if (!template) throw new NotFoundError('Pipeline template not found');

    // Clone the template's stages so later template edits never mutate live jobs.
    const stages = template.stages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, index) => ({ name: s.name, order: index, type: s.type }));

    const job = await jobRepository.create({
      tenantId,
      createdById: creator.id,
      title: data.title,
      description: data.description,
      departmentId: data.departmentId,
      positionId: data.positionId,
      employmentType: data.employmentType ?? 'FULL_TIME',
      location: data.location,
      headcount: data.headcount ?? 1,
      status: data.status ?? 'DRAFT',
      stages,
    });
    return toDetailDto(job);
  },

  async update(
    id: string,
    tenantId: string,
    data: {
      title?: string;
      description?: string | null;
      departmentId?: string | null;
      positionId?: string | null;
      employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
      location?: string | null;
      headcount?: number;
    }
  ) {
    const job = await jobRepository.findById(id, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    await assertRefs(tenantId, data.departmentId, data.positionId);

    const updated = await jobRepository.update(id, data);
    return toDetailDto(updated);
  },

  async changeStatus(id: string, tenantId: string, next: JobStatus) {
    const job = await jobRepository.findById(id, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    if (job.status === next) return toDetailDto(job);

    if (!STATUS_TRANSITIONS[job.status].includes(next)) {
      throw new ConflictError(`Cannot change job status from ${job.status} to ${next}`);
    }

    const patch: { status: JobStatus; openedAt?: Date | null; closedAt?: Date | null } = {
      status: next,
    };
    if (next === 'OPEN') {
      if (!job.openedAt) patch.openedAt = new Date();
      patch.closedAt = null; // reopening clears the previous close timestamp
    } else if (next === 'CLOSED') {
      patch.closedAt = new Date();
    }

    const updated = await jobRepository.updateStatus(id, patch);
    return toDetailDto(updated);
  },

  // Replace the whole stage list (reorder / rename / add / remove) in one shot.
  async reorderStages(
    id: string,
    tenantId: string,
    stages: { id?: string; name: string; order: number; type: StageType }[]
  ) {
    const job = await jobRepository.findById(id, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    const usage = await jobRepository.findStagesWithUsage(id);
    const usageById = new Map(usage.map((s) => [s.id, s]));

    // Every id in the payload must belong to this job.
    for (const s of stages) {
      if (s.id && !usageById.has(s.id)) {
        throw new ValidationError('Unknown stage id for this job');
      }
    }

    const keptIds = new Set(stages.filter((s) => s.id).map((s) => s.id as string));
    const removed = usage.filter((s) => !keptIds.has(s.id));

    for (const r of removed) {
      // Terminal stages must always persist so hired/rejected applications have a home.
      if (r.type === 'HIRED' || r.type === 'REJECTED') {
        throw new ConflictError('Cannot delete the HIRED or REJECTED stage');
      }
      if (r._count.applications > 0 || r._count.fromHistory > 0 || r._count.toHistory > 0) {
        throw new ConflictError('Cannot delete a stage that has applications');
      }
    }

    const plan: ReorderStagesPlan = {
      removedIds: removed.map((r) => r.id),
      updates: stages
        .filter((s) => s.id)
        .map((s) => ({ id: s.id as string, name: s.name, order: s.order, type: s.type })),
      creates: stages
        .filter((s) => !s.id)
        .map((s) => ({ name: s.name, order: s.order, type: s.type })),
    };

    await jobRepository.reorderStages(id, plan);
    const refreshed = await jobRepository.findById(id, tenantId);
    return toDetailDto(refreshed!);
  },

  // ===== Hiring team =====

  async addHiringTeamMember(
    jobId: string,
    tenantId: string,
    employeeId: string,
    teamRole: HiringTeamRole
  ) {
    const job = await jobRepository.findById(jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    const employee = await employeeRepository.findById(employeeId, tenantId);
    if (!employee) throw new NotFoundError('Employee not found');

    const existing = await jobRepository.findHiringTeamMemberByEmployee(jobId, employeeId);
    if (existing) throw new ConflictError('Employee is already on this hiring team');

    const member = await jobRepository.addHiringTeamMember(jobId, employeeId, teamRole);
    return toHiringTeamMemberDto(member);
  },

  async updateHiringTeamMember(
    jobId: string,
    tenantId: string,
    memberId: string,
    teamRole: HiringTeamRole
  ) {
    const job = await jobRepository.findById(jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    const member = await jobRepository.findHiringTeamMember(jobId, memberId);
    if (!member) throw new NotFoundError('Hiring team member not found');

    const updated = await jobRepository.updateHiringTeamMember(memberId, teamRole);
    return toHiringTeamMemberDto(updated);
  },

  async removeHiringTeamMember(jobId: string, tenantId: string, memberId: string) {
    const job = await jobRepository.findById(jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    const member = await jobRepository.findHiringTeamMember(jobId, memberId);
    if (!member) throw new NotFoundError('Hiring team member not found');

    await jobRepository.deleteHiringTeamMember(memberId);
  },
};
