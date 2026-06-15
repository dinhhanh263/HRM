import type { Request, Response } from 'express';
import type { JobStatus } from '@prisma/client';
import { jobService } from '../../domain/services/job.service.js';
import type { JobListFilters } from '../../domain/repositories/job.repository.js';

const JOB_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

function parseFilters(query: Request['query']): JobListFilters {
  const filters: JobListFilters = {};
  if (typeof query.search === 'string' && query.search.trim()) {
    filters.search = query.search.trim();
  }
  if (typeof query.status === 'string' && JOB_STATUSES.includes(query.status as JobStatus)) {
    filters.status = query.status as JobStatus;
  }
  if (typeof query.departmentId === 'string' && query.departmentId.trim()) {
    filters.departmentId = query.departmentId.trim();
  }
  return filters;
}

export const jobController = {
  async getAll(req: Request, res: Response) {
    const data = await jobService.getAll(req.user!.tenantId, parseFilters(req.query));
    res.json({ success: true, data });
  },

  async getById(req: Request, res: Response) {
    const data = await jobService.getById(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const data = await jobService.create(req.user!.tenantId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const data = await jobService.update(req.params.id, req.user!.tenantId, req.body);
    res.json({ success: true, data });
  },

  async changeStatus(req: Request, res: Response) {
    const data = await jobService.changeStatus(req.params.id, req.user!.tenantId, req.body.status);
    res.json({ success: true, data });
  },

  async reorderStages(req: Request, res: Response) {
    const data = await jobService.reorderStages(
      req.params.id,
      req.user!.tenantId,
      req.body.stages
    );
    res.json({ success: true, data });
  },

  async addHiringTeamMember(req: Request, res: Response) {
    const data = await jobService.addHiringTeamMember(
      req.params.id,
      req.user!.tenantId,
      req.body.employeeId,
      req.body.teamRole
    );
    res.status(201).json({ success: true, data });
  },

  async updateHiringTeamMember(req: Request, res: Response) {
    const data = await jobService.updateHiringTeamMember(
      req.params.id,
      req.user!.tenantId,
      req.params.memberId,
      req.body.teamRole
    );
    res.json({ success: true, data });
  },

  async removeHiringTeamMember(req: Request, res: Response) {
    await jobService.removeHiringTeamMember(req.params.id, req.user!.tenantId, req.params.memberId);
    res.json({ success: true, data: { message: 'Hiring team member removed' } });
  },
};
