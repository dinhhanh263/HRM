import type { Request, Response } from 'express';
import { applicationService } from '../../domain/services/application.service.js';
import { permissionService } from '../../domain/services/permission.service.js';

// Resolve whether the caller may force past a soft stage gate. Mirrors the
// requirePermission middleware: SUPER_ADMIN is implicit-all; otherwise the key
// must be in the role's resolved permission set. Kept here (not the route) so the
// move route stays a single endpoint — force is a condition, not a separate action.
async function callerCanForceMove(req: Request): Promise<boolean> {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (!user.roleId) return false;
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('recruitment:application_force_move');
}

export const applicationController = {
  async create(req: Request, res: Response) {
    const data = await applicationService.create(req.user!.tenantId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async listByCandidate(req: Request, res: Response) {
    const data = await applicationService.listByCandidate(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async listByJob(req: Request, res: Response) {
    const data = await applicationService.listByJob(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async getById(req: Request, res: Response) {
    const data = await applicationService.getById(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async move(req: Request, res: Response) {
    const actorCanForce = await callerCanForceMove(req);
    const data = await applicationService.move(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id,
      req.body,
      actorCanForce
    );
    res.json({ success: true, data });
  },

  async reject(req: Request, res: Response) {
    const data = await applicationService.reject(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id,
      req.body
    );
    res.json({ success: true, data });
  },

  async hire(req: Request, res: Response) {
    const data = await applicationService.hire(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id,
      req.body
    );
    res.json({ success: true, data });
  },

  async withdraw(req: Request, res: Response) {
    const data = await applicationService.withdraw(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id,
      req.body
    );
    res.json({ success: true, data });
  },

  async listActivities(req: Request, res: Response) {
    const data = await applicationService.listActivities(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  },

  async createNote(req: Request, res: Response) {
    const data = await applicationService.createNote(
      req.user!.tenantId,
      req.user!.sub,
      req.params.id,
      req.body
    );
    res.status(201).json({ success: true, data });
  },
};
