import type { Request, Response } from 'express';
import { purchaseRequestService } from '../../domain/services/purchase-request.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { roleRepository } from '../../domain/repositories/role.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import type { ApprovalActor } from '../../domain/leave/approval-routing.helper.js';
import { BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import { purchaseRequestQuerySchema } from '../validators/purchase-request.validator.js';
import { buildPurchaseExportWorkbook } from '../../domain/purchase-request/export.js';
import { logger } from '../../shared/utils/logger.js';

/** Resolve the Employee linked to the authenticated user, or null (e.g. tenant admins). */
async function resolveCurrentEmployee(req: Request) {
  return employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
}

async function requireCurrentEmployee(req: Request) {
  const employee = await resolveCurrentEmployee(req);
  if (!employee) {
    throw new BadRequestError('No employee profile is linked to your account');
  }
  return employee;
}

/** Actor for the per-step approval engine + the submitter's role context. */
async function buildApprovalActor(req: Request): Promise<ApprovalActor> {
  const user = req.user!;
  const employee = await resolveCurrentEmployee(req);
  let roleKey: string | null = null;
  if (user.roleId) {
    const role = await roleRepository.findById(user.roleId, user.tenantId);
    roleKey = role?.key ?? null;
  }
  return {
    employeeId: employee?.id ?? null,
    roleKey,
    isSuperAdmin: user.role === 'SUPER_ADMIN',
  };
}

/**
 * Cross-employee reads (review/all scope) require approve/reject capability — the
 * route only checks purchase_request:view, which every role has. SUPER_ADMIN bypasses.
 */
async function requireReviewCapability(req: Request) {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.roleId) {
    throw new ForbiddenError('You do not have permission to review purchase requests');
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  if (!granted.has('purchase_request:approve') && !granted.has('purchase_request:reject')) {
    throw new ForbiddenError('You do not have permission to review purchase requests');
  }
}

export const purchaseRequestController = {
  async listRequests(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { page, limit, ...input } = purchaseRequestQuerySchema.parse(req.query);

    if (input.scope === 'all') {
      await requireReviewCapability(req);
      const result = await purchaseRequestService.list(tenantId, '', input, { page, limit });
      res.json({ success: true, data: result });
      return;
    }
    if (input.scope === 'review') {
      await requireReviewCapability(req);
      const actor = await buildApprovalActor(req);
      const result = await purchaseRequestService.listReview(tenantId, actor, input, { page, limit });
      res.json({ success: true, data: result });
      return;
    }

    // 'mine': a profile-less user (e.g. tenant admin) simply has no personal requests.
    const employee = await resolveCurrentEmployee(req);
    if (!employee) {
      res.json({ success: true, data: { items: [], total: 0, page, limit, totalAmount: '0' } });
      return;
    }
    const result = await purchaseRequestService.list(tenantId, employee.id, input, { page, limit });
    res.json({ success: true, data: result });
  },

  async exportRequests(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { scope, ...input } = purchaseRequestQuerySchema.parse(req.query);
    const effectiveScope = scope ?? 'mine';

    let employeeId = '';
    const actor = await buildApprovalActor(req);
    if (effectiveScope === 'all' || effectiveScope === 'review') {
      await requireReviewCapability(req);
    } else {
      employeeId = (await requireCurrentEmployee(req)).id;
    }

    const rows = await purchaseRequestService.getExportRows(tenantId, effectiveScope, employeeId, actor, input);
    const buffer = await buildPurchaseExportWorkbook(rows);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="purchase-requests-${effectiveScope}-${stamp}.xlsx"`);
    res.send(buffer);
  },

  async getStats(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    // Company-wide stats → same gate as scope=all (review capability / SUPER_ADMIN).
    await requireReviewCapability(req);
    const parsed = Number(req.query.year);
    const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : new Date().getUTCFullYear();
    const data = await purchaseRequestService.getStats(tenantId, year);
    res.json({ success: true, data });
  },

  async getRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const request = await purchaseRequestService.getById(req.params.id, tenantId);

    // Owners always see their own request; viewing anyone else's requires review capability.
    const employee = await resolveCurrentEmployee(req);
    if (!employee || request.employeeId !== employee.id) {
      await requireReviewCapability(req);
    }
    res.json({ success: true, data: request });
  },

  async getRequestPdf(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;

    // Same read authorization as viewing the request: owner, or review capability.
    const request = await purchaseRequestService.getById(req.params.id, tenantId);
    const employee = await resolveCurrentEmployee(req);
    if (!employee || request.employeeId !== employee.id) {
      await requireReviewCapability(req);
    }

    const { buffer, filename } = await purchaseRequestService.renderPdf(tenantId, req.params.id);
    const asciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  },

  async createRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const actor = await buildApprovalActor(req);

    const request = await purchaseRequestService.create(
      tenantId,
      employee.id,
      { isSuperAdmin: actor.isSuperAdmin, roleKey: actor.roleKey },
      req.body,
    );
    res.status(201).json({ success: true, data: request });
  },

  async updateRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);

    const request = await purchaseRequestService.update(req.params.id, tenantId, employee.id, req.body);
    res.json({ success: true, data: request });
  },

  // ---- Attachments ----

  async uploadAttachment(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const file = req.file;
    if (!file) {
      throw new BadRequestError('Chưa có tệp nào được tải lên (trường "file")', 'PURCHASE_NO_FILE');
    }
    const data = await purchaseRequestService.addAttachment(req.params.id, tenantId, employee.id, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
    res.status(201).json({ success: true, data });
  },

  async deleteAttachment(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    await purchaseRequestService.removeAttachment(
      req.params.id,
      tenantId,
      employee.id,
      req.params.attId,
    );
    res.status(204).send();
  },

  async downloadAttachment(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;

    // Same read authorization as viewing the request: owner, or review capability.
    const request = await purchaseRequestService.getById(req.params.id, tenantId);
    const employee = await resolveCurrentEmployee(req);
    if (!employee || request.employeeId !== employee.id) {
      await requireReviewCapability(req);
    }

    const { stream, contentType, fileName } = await purchaseRequestService.getDownload(
      req.params.id,
      tenantId,
      req.params.attId,
    );
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.on('error', (err: unknown) => {
      logger.error({ err, attachmentId: req.params.attId }, 'Purchase attachment download stream failed');
      if (!res.headersSent) res.status(404).end();
      else res.destroy();
    });
    stream.pipe(res);
  },

  // ---- Decisions ----

  async approveRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);
    const request = await purchaseRequestService.approve(req.params.id, tenantId, actor);
    res.json({ success: true, data: request });
  },

  async respondRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);
    const request = await purchaseRequestService.respond(
      req.params.id,
      tenantId,
      actor,
      req.body.mode,
      req.body.note,
    );
    res.json({ success: true, data: request });
  },

  async resubmitRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const actor = await buildApprovalActor(req);
    const request = await purchaseRequestService.resubmit(
      req.params.id,
      tenantId,
      employee.id,
      { isSuperAdmin: actor.isSuperAdmin, roleKey: actor.roleKey },
      req.body,
    );
    res.json({ success: true, data: request });
  },

  async cancelRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employee = await requireCurrentEmployee(req);
    const request = await purchaseRequestService.cancel(req.params.id, tenantId, employee.id);
    res.json({ success: true, data: request });
  },

  async markOrderedRequest(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await buildApprovalActor(req);
    const request = await purchaseRequestService.markOrdered(
      req.params.id,
      tenantId,
      actor,
      req.body.orderNote,
    );
    res.json({ success: true, data: request });
  },
};
