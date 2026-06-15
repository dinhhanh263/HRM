import type { Request, Response } from 'express';
import { assetCategoryService } from '../../domain/services/asset-category.service.js';
import { assetService } from '../../domain/services/asset.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { assetQuerySchema, assetExportQuerySchema } from '../validators/asset.validator.js';
import { BadRequestError } from '../../shared/errors/index.js';
import { toCsv } from '../../shared/utils/csv.js';

// Vietnamese column order for the CSV export (Excel-friendly).
const EXPORT_HEADERS = [
  'Mã tài sản',
  'Tên',
  'Loại',
  'Trạng thái',
  'Người giữ',
  'Vị trí',
  'Số serial',
  'Hãng',
  'Model',
  'Tình trạng',
  'Ngày mua',
  'Giá mua',
  'Hạn bảo hành',
  'Nhà cung cấp',
];

// ISO datetime → date-only (YYYY-MM-DD); empty for null.
const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

// Assign/return/self-service all act on behalf of an Employee identity (the
// AssetAssignment FKs reference Employee, not User). Resolve the acting user's
// employee record; reject if they have none (e.g. an admin with no HR profile).
async function requireActingEmployeeId(req: Request): Promise<string> {
  const employee = await employeeRepository.findByUserId(req.user!.sub, req.user!.tenantId);
  if (!employee) {
    throw new BadRequestError(
      'Your account is not linked to an employee profile',
      'NO_EMPLOYEE_PROFILE',
    );
  }
  return employee.id;
}

// Whether the caller holds assets:assign (HR/admin scope — may read any handover).
async function callerCanAssign(req: Request): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  if (!user.roleId) {
    return false;
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('assets:assign');
}

export const assetController = {
  async listCategories(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const categories = await assetCategoryService.list(tenantId);

    res.json({ success: true, data: categories });
  },

  async createCategory(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const category = await assetCategoryService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: category });
  },

  async updateCategory(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const category = await assetCategoryService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: category });
  },

  async deleteCategory(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await assetCategoryService.remove(req.params.id, tenantId);

    res.json({ success: true, data: { message: 'Asset category deleted successfully' } });
  },

  // ── Assets (tài sản) ──────────────────────────────────────────────────────
  async list(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { page, limit, ...filters } = assetQuerySchema.parse(req.query);
    const result = await assetService.list(tenantId, filters, { page, limit });

    res.json({ success: true, data: result.data, pagination: result.pagination });
  },

  async exportCsv(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const filters = assetExportQuerySchema.parse(req.query);
    const assets = await assetService.listForExport(tenantId, filters);

    const rows = assets.map((a) => [
      a.assetCode,
      a.name,
      a.category?.name ?? '',
      a.status,
      a.currentAssignment?.employee?.fullName ?? '',
      a.location ?? '',
      a.serialNumber ?? '',
      a.brand ?? '',
      a.model ?? '',
      a.condition ?? '',
      dateOnly(a.purchaseDate),
      a.purchaseCost ?? '',
      dateOnly(a.warrantyEndDate),
      a.vendor ?? '',
    ]);

    const filename = `assets-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(toCsv(EXPORT_HEADERS, rows));
  },

  async getById(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const asset = await assetService.get(req.params.id, tenantId);

    res.json({ success: true, data: asset });
  },

  async create(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const asset = await assetService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: asset });
  },

  async update(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const asset = await assetService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: asset });
  },

  async remove(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await assetService.remove(req.params.id, tenantId);

    res.json({ success: true, data: { message: 'Asset deleted successfully' } });
  },

  // ── Assignment lifecycle (cấp phát / thu hồi) + self-service ───────────────
  async assign(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actingEmployeeId = await requireActingEmployeeId(req);
    const asset = await assetService.assign(
      req.params.id,
      tenantId,
      actingEmployeeId,
      req.user!.sub,
      req.body,
    );

    res.json({ success: true, data: asset });
  },

  async returnAsset(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actingEmployeeId = await requireActingEmployeeId(req);
    const asset = await assetService.returnAsset(req.params.id, tenantId, actingEmployeeId, req.body);

    res.json({ success: true, data: asset });
  },

  // IN_APP: người nhận ký xác nhận biên bản của chính mình. Ownership được service
  // bảo vệ qua actingEmployeeId; acknowledgedByUserId ghi nhận user đã ký.
  async acknowledgeHandover(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actingEmployeeId = await requireActingEmployeeId(req);
    const assignment = await assetService.acknowledgeHandover(
      req.params.assignmentId,
      tenantId,
      req.user!.sub,
      actingEmployeeId,
      req.body,
    );

    res.json({ success: true, data: assignment });
  },

  async listMine(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const employeeId = await requireActingEmployeeId(req);
    const assets = await assetService.listMine(tenantId, employeeId);

    res.json({ success: true, data: assets });
  },

  // Tải biên bản bàn giao (PDF). Quyền: chủ phiếu (ownership) hoặc người có
  // assets:assign. Không yêu cầu phải có hồ sơ nhân viên (admin tải được).
  async downloadHandoverPdf(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const [self, canAssign] = await Promise.all([
      employeeRepository.findByUserId(req.user!.sub, tenantId),
      callerCanAssign(req),
    ]);
    const { buffer, filename } = await assetService.renderHandoverPdf(req.params.assignmentId, tenantId, {
      employeeId: self?.id ?? null,
      canAssign,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  // Xem ảnh chữ ký (PNG) của một biên bản. Quyền giống PDF: chủ phiếu hoặc người
  // có assets:assign. no-store vì là PII — không cho cache lại.
  async getHandoverSignature(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const [self, canAssign] = await Promise.all([
      employeeRepository.findByUserId(req.user!.sub, tenantId),
      callerCanAssign(req),
    ]);
    const { buffer } = await assetService.getHandoverSignature(req.params.assignmentId, tenantId, {
      employeeId: self?.id ?? null,
      canAssign,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  },

  // ── Maintenance + disposal (bảo trì / thanh lý) ────────────────────────────
  async startMaintenance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actingEmployeeId = await requireActingEmployeeId(req);
    const asset = await assetService.startMaintenance(req.params.id, tenantId, actingEmployeeId, req.body);

    res.json({ success: true, data: asset });
  },

  async completeMaintenance(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const asset = await assetService.completeMaintenance(req.params.id, tenantId, req.body);

    res.json({ success: true, data: asset });
  },

  async dispose(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actingEmployeeId = await requireActingEmployeeId(req);
    const asset = await assetService.dispose(req.params.id, tenantId, actingEmployeeId, req.body);

    res.json({ success: true, data: asset });
  },
};
