import type { Request, Response } from 'express';
import { kpiCycleService as svc } from '../../domain/services/kpi-cycle.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { roleRepository } from '../../domain/repositories/role.repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import type { ApprovalActor } from '../../domain/leave/approval-routing.helper.js';
import { buildKpiCycleWorkbook } from '../../domain/kpi/export.js';

const tid = (req: Request) => req.user!.tenantId;

/** Employee id của người đang thao tác (cho audit actor fields); null nếu user không có hồ sơ NV. */
async function actorId(req: Request): Promise<string | null> {
  const emp = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  return emp?.id ?? null;
}

/** Actor cho engine duyệt (employeeId + roleKey + isSuperAdmin). */
async function buildApprovalActor(req: Request): Promise<ApprovalActor> {
  const user = req.user!;
  const emp = await employeeRepository.findByUserId(user.sub, user.tenantId);
  let roleKey: string | null = null;
  if (user.roleId) {
    const role = await roleRepository.findById(user.roleId, user.tenantId);
    roleKey = role?.key ?? null;
  }
  return { employeeId: emp?.id ?? null, roleKey, isSuperAdmin: user.role === 'SUPER_ADMIN' };
}

export const kpiCycleController = {
  async list(req: Request, res: Response) {
    res.json({ success: true, data: await svc.list(tid(req)) });
  },
  async getDetail(req: Request, res: Response) {
    res.json({ success: true, data: await svc.getDetail(req.params.id, tid(req)) });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await svc.create(tid(req), req.body, await actorId(req)) });
  },
  async transition(req: Request, res: Response) {
    res.json({ success: true, data: await svc.transition(req.params.id, tid(req), req.body.status, await actorId(req)) });
  },
  async upsertEntries(req: Request, res: Response) {
    res.json({ success: true, data: await svc.upsertEntries(req.params.id, tid(req), req.body.entries, await actorId(req)) });
  },
  async setScorecardProfile(req: Request, res: Response) {
    res.json({ success: true, data: await svc.setScorecardProfile(req.params.scorecardId, tid(req), req.body.weightProfileId ?? null) });
  },
  async aggregateSurveys(req: Request, res: Response) {
    res.json({ success: true, data: await svc.aggregateSurveys(req.params.id, tid(req)) });
  },
  async exportCycle(req: Request, res: Response) {
    const cycle = await svc.getDetail(req.params.id, tid(req));
    const buffer = await buildKpiCycleWorkbook(cycle);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kpi-${cycle.frameworkName.replace(/[^a-zA-Z0-9]+/g, '-')}-${cycle.period}.xlsx"`);
    res.send(buffer);
  },

  async selfAssess(req: Request, res: Response) {
    res.json({ success: true, data: await svc.selfAssess(req.params.scorecardId, tid(req), await actorId(req), req.body) });
  },
  async reviewScorecard(req: Request, res: Response) {
    res.json({ success: true, data: await svc.reviewScorecard(req.params.scorecardId, tid(req), await buildApprovalActor(req), req.body) });
  },
  async resubmitScorecard(req: Request, res: Response) {
    res.json({ success: true, data: await svc.resubmitScorecard(req.params.scorecardId, tid(req), await buildApprovalActor(req)) });
  },

  async myHistory(req: Request, res: Response) {
    const emp = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
    if (!emp) throw new NotFoundError('Bạn chưa có hồ sơ nhân viên');
    res.json({ success: true, data: await svc.getEmployeeHistory(tid(req), emp.id) });
  },

  async employeeHistory(req: Request, res: Response) {
    const u = req.user!;
    const data = await svc.getEmployeeHistoryForViewer(
      tid(req), { userId: u.sub, role: u.role, roleId: u.roleId }, req.params.employeeId,
    );
    res.json({ success: true, data });
  },
};
