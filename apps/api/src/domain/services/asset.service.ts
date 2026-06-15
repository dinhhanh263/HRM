import { assetRepository, type AssetFilters, type PaginationOptions } from '../repositories/asset.repository.js';
import { assetCategoryRepository } from '../repositories/asset-category.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { toAssetDto, toAssetDetailDto, toAssignmentDto } from '../assets/mappers.js';
import { renderHandoverPdf, decodeSignaturePng } from '../assets/handover.pdf.js';
import {
  assertAssignable,
  assertReturnable,
  assertMaintainable,
  assertMaintenanceCompletable,
  assertDisposable,
} from '../assets/asset-state.helper.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors/index.js';
import type {
  AssetDto,
  AssetDetailDto,
  AssetAssignmentDto,
  CreateAssetInput,
  UpdateAssetInput,
  AssignAssetInput,
  AcknowledgeHandoverInput,
  ReturnAssetInput,
  CreateMaintenanceInput,
  CompleteMaintenanceInput,
  DisposeAssetInput,
} from '@hrm/shared';

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

export const assetService = {
  async list(
    tenantId: string,
    filters: AssetFilters,
    pagination: PaginationOptions,
  ): Promise<{ data: AssetDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const result = await assetRepository.findAll(tenantId, filters, pagination);
    return { data: result.data.map(toAssetDto), pagination: result.pagination };
  },

  // Tất cả tài sản khớp filter (không phân trang) cho việc xuất CSV.
  async listForExport(tenantId: string, filters: AssetFilters): Promise<AssetDto[]> {
    const assets = await assetRepository.findAllForExport(tenantId, filters);
    return assets.map(toAssetDto);
  },

  async get(id: string, tenantId: string): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    return toAssetDetailDto(asset);
  },

  async create(tenantId: string, input: CreateAssetInput): Promise<AssetDto> {
    const category = await assetCategoryRepository.findById(input.categoryId, tenantId);
    if (!category) {
      throw new NotFoundError('Asset category not found');
    }

    const duplicate = await assetRepository.findByAssetCode(input.assetCode, tenantId);
    if (duplicate) {
      throw new ConflictError('Asset code already exists', 'ASSET_CODE_TAKEN');
    }

    const created = await assetRepository.create({
      tenantId,
      categoryId: input.categoryId,
      assetCode: input.assetCode,
      name: input.name,
      serialNumber: input.serialNumber ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      condition: input.condition ?? null,
      purchaseDate: toDate(input.purchaseDate) ?? null,
      purchaseCost: input.purchaseCost ?? null,
      warrantyEndDate: toDate(input.warrantyEndDate) ?? null,
      vendor: input.vendor ?? null,
      location: input.location ?? null,
      note: input.note ?? null,
    });

    return toAssetDto(created);
  },

  async update(id: string, tenantId: string, input: UpdateAssetInput): Promise<AssetDto> {
    const existing = await assetRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Asset not found');
    }

    // Moving to another category — verify it belongs to the tenant.
    if (input.categoryId && input.categoryId !== existing.categoryId) {
      const category = await assetCategoryRepository.findById(input.categoryId, tenantId);
      if (!category) {
        throw new NotFoundError('Asset category not found');
      }
    }

    // Changing the code — block collisions with another asset.
    if (input.assetCode && input.assetCode !== existing.assetCode) {
      const duplicate = await assetRepository.findByAssetCode(input.assetCode, tenantId);
      if (duplicate) {
        throw new ConflictError('Asset code already exists', 'ASSET_CODE_TAKEN');
      }
    }

    const updated = await assetRepository.update(id, {
      categoryId: input.categoryId,
      assetCode: input.assetCode,
      name: input.name,
      serialNumber: input.serialNumber,
      brand: input.brand,
      model: input.model,
      condition: input.condition,
      purchaseDate: toDate(input.purchaseDate),
      purchaseCost: input.purchaseCost,
      warrantyEndDate: toDate(input.warrantyEndDate),
      vendor: input.vendor,
      location: input.location,
      note: input.note,
    });

    return toAssetDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await assetRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Asset not found');
    }

    const history = await assetRepository.countHistory(id);
    if (history > 0) {
      throw new ConflictError(
        'Cannot delete an asset that has assignment or maintenance history',
        'ASSET_HAS_HISTORY',
      );
    }

    await assetRepository.delete(id);
  },

  // Cấp phát tài sản cho nhân viên. `actingEmployeeId` là nhân viên thực hiện
  // (assignedById). Toàn bộ chạy trong $transaction: chỉ tạo assignment ACTIVE
  // nếu compare-and-set AVAILABLE→ASSIGNED thành công — bảo toàn bất biến "1 ACTIVE".
  async assign(
    id: string,
    tenantId: string,
    actingEmployeeId: string,
    actingUserId: string,
    input: AssignAssetInput,
  ): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    assertAssignable(asset.status);

    const employee = await employeeRepository.findById(input.employeeId, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    // Chữ ký lấy tại chỗ lúc cấp phát (ON_SCREEN) → biên bản tạo ở trạng thái
    // SIGNED ngay; không có chữ ký → PENDING (ký sau, ON_SCREEN/IN_APP đều được).
    const signed = input.signature != null;

    await db.$transaction(async (tx) => {
      const claimed = await assetRepository.claimForAssignment(tx, id, tenantId);
      if (claimed !== 1) {
        // Lost the race / no longer AVAILABLE — keep the invariant intact.
        throw new ConflictError('Asset must be AVAILABLE to be assigned', 'ASSET_NOT_ASSIGNABLE');
      }
      await assetRepository.createAssignment(tx, {
        tenantId,
        assetId: id,
        employeeId: input.employeeId,
        assignedById: actingEmployeeId,
        assignedAt: new Date(input.assignedAt),
        conditionOut: input.conditionOut ?? null,
        note: input.note ?? null,
        status: 'ACTIVE',
        ackStatus: signed ? 'SIGNED' : 'PENDING',
        ackMethod: signed ? (input.ackMethod ?? 'ON_SCREEN') : null,
        acknowledgedAt: signed ? new Date() : null,
        acknowledgedByUserId: signed ? actingUserId : null,
        signatureImage: input.signature ?? null,
      });
    });

    return this.get(id, tenantId);
  },

  // Ký xác nhận một biên bản đang chờ (IN_APP — người nhận ký từ xa trên app).
  // Bất biến: chỉ chính người được cấp phát mới ký được biên bản của mình (403),
  // biên bản phải còn ACTIVE (đã thu hồi → 409) và chưa ký (đã ký → 409).
  async acknowledgeHandover(
    assignmentId: string,
    tenantId: string,
    actingUserId: string,
    actingEmployeeId: string,
    input: AcknowledgeHandoverInput,
  ): Promise<AssetAssignmentDto> {
    const assignment = await assetRepository.findAssignmentById(assignmentId, tenantId);
    if (!assignment) {
      throw new NotFoundError('Handover record not found');
    }
    if (assignment.employeeId !== actingEmployeeId) {
      throw new ForbiddenError('You can only acknowledge your own handover');
    }
    if (assignment.status !== 'ACTIVE') {
      throw new ConflictError('Handover record is no longer active', 'ASSIGNMENT_NOT_ACTIVE');
    }
    if (assignment.ackStatus === 'SIGNED') {
      throw new ConflictError('Handover already acknowledged', 'ALREADY_ACKNOWLEDGED');
    }

    // Pre-checks above give friendly 403/409 messages, but they're a read —
    // two concurrent signs can both pass them. The guarded write is the real
    // gate: it only stamps a still-PENDING row, so the loser of the race gets
    // count 0 and the same ALREADY_ACKNOWLEDGED conflict.
    const count = await assetRepository.updateAssignmentAck(assignmentId, tenantId, {
      ackStatus: 'SIGNED',
      ackMethod: 'IN_APP',
      acknowledgedAt: new Date(),
      acknowledgedByUserId: actingUserId,
      signatureImage: input.signature,
    });
    if (count !== 1) {
      throw new ConflictError('Handover already acknowledged', 'ALREADY_ACKNOWLEDGED');
    }

    const updated = await assetRepository.findAssignmentById(assignmentId, tenantId);
    return toAssignmentDto(updated!);
  },

  // Thu hồi tài sản: đóng assignment ACTIVE và trả AVAILABLE, trong $transaction.
  async returnAsset(
    id: string,
    tenantId: string,
    actingEmployeeId: string,
    input: ReturnAssetInput,
  ): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    assertReturnable(asset.status);

    // Preserve the original assignment note when no return note is supplied —
    // the assignment row carries a single shared note field.
    const activeNote = asset.assignments?.find((a) => a.status === 'ACTIVE')?.note ?? null;

    await db.$transaction(async (tx) => {
      const released = await assetRepository.releaseFromAssignment(tx, id, tenantId);
      if (released !== 1) {
        throw new ConflictError('Asset must be ASSIGNED to be returned', 'ASSET_NOT_RETURNABLE');
      }
      const closed = await assetRepository.closeActiveAssignment(tx, id, tenantId, {
        returnedAt: new Date(input.returnedAt),
        returnedById: actingEmployeeId,
        conditionIn: input.conditionIn ?? null,
        note: input.note ?? activeNote,
      });
      if (closed !== 1) {
        // Status said ASSIGNED but no ACTIVE assignment — inconsistent; abort.
        throw new ConflictError('No active assignment to return', 'ASSET_NOT_RETURNABLE');
      }
    });

    return this.get(id, tenantId);
  },

  // Bắt đầu bảo trì: tạo bản ghi bảo trì mở (completedAt null) và chuyển
  // AVAILABLE→UNDER_MAINTENANCE trong $transaction. Bất biến: 1 bản ghi mở/tài sản.
  async startMaintenance(
    id: string,
    tenantId: string,
    actingEmployeeId: string,
    input: CreateMaintenanceInput,
  ): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    assertMaintainable(asset.status);

    await db.$transaction(async (tx) => {
      const claimed = await assetRepository.claimForMaintenance(tx, id, tenantId);
      if (claimed !== 1) {
        throw new ConflictError(
          'Asset must be AVAILABLE to start maintenance',
          'ASSET_NOT_MAINTAINABLE',
        );
      }
      await assetRepository.createMaintenance(tx, {
        tenantId,
        assetId: id,
        startedAt: new Date(input.startedAt),
        description: input.description,
        vendor: input.vendor ?? null,
        cost: input.cost ?? null,
        createdById: actingEmployeeId,
      });
    });

    return this.get(id, tenantId);
  },

  // Hoàn tất bảo trì: đóng bản ghi mở và trả UNDER_MAINTENANCE→AVAILABLE.
  async completeMaintenance(
    id: string,
    tenantId: string,
    input: CompleteMaintenanceInput,
  ): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    assertMaintenanceCompletable(asset.status);

    await db.$transaction(async (tx) => {
      const released = await assetRepository.releaseFromMaintenance(tx, id, tenantId);
      if (released !== 1) {
        throw new ConflictError('Asset is not under maintenance', 'ASSET_NOT_UNDER_MAINTENANCE');
      }
      // undefined = giữ nguyên giá trị đặt lúc start (Prisma updateMany bỏ qua
      // field undefined); chỉ ghi đè khi lần hoàn tất có cung cấp giá trị mới.
      const closed = await assetRepository.completeOpenMaintenance(tx, id, tenantId, {
        completedAt: new Date(input.completedAt),
        description: input.description,
        vendor: input.vendor ?? undefined,
        cost: input.cost ?? undefined,
      });
      if (closed !== 1) {
        // Status said UNDER_MAINTENANCE but no open record — inconsistent; abort.
        throw new ConflictError('No open maintenance to complete', 'ASSET_NOT_UNDER_MAINTENANCE');
      }
    });

    return this.get(id, tenantId);
  },

  // Thanh lý tài sản (terminal). Chỉ từ AVAILABLE/UNDER_MAINTENANCE; chặn nếu
  // đang cấp phát hoặc đã thanh lý.
  async dispose(
    id: string,
    tenantId: string,
    actingEmployeeId: string,
    input: DisposeAssetInput,
  ): Promise<AssetDetailDto> {
    const asset = await assetRepository.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
    assertDisposable(asset.status);

    await db.$transaction(async (tx) => {
      const disposed = await assetRepository.disposeAsset(tx, id, tenantId, {
        status: input.status,
        retiredAt: new Date(input.retiredAt),
        retirementReason: input.reason,
        retiredById: actingEmployeeId,
      });
      if (disposed !== 1) {
        throw new ConflictError('Asset cannot be disposed in its current state', 'ASSET_NOT_DISPOSABLE');
      }
    });

    return this.get(id, tenantId);
  },

  // Self-service: tài sản nhân viên đang giữ (assignment ACTIVE).
  async listMine(tenantId: string, employeeId: string): Promise<AssetDto[]> {
    const assets = await assetRepository.findHeldBy(employeeId, tenantId);
    return assets.map(toAssetDto);
  },

  // Biên bản bàn giao (PDF). Quyền: người nhận tải biên bản của chính mình, hoặc
  // người có quyền cấp phát (HR/admin) tải bất kỳ. Chữ ký (PII) chỉ nhúng vào PDF
  // phía server, không bao giờ trả qua DTO.
  async renderHandoverPdf(
    assignmentId: string,
    tenantId: string,
    viewer: { employeeId: string | null; canAssign: boolean },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const assignment = await assetRepository.findAssignmentForHandover(assignmentId, tenantId);
    if (!assignment) {
      throw new NotFoundError('Handover record not found');
    }
    const isOwner = viewer.employeeId !== null && assignment.employeeId === viewer.employeeId;
    if (!isOwner && !viewer.canAssign) {
      throw new ForbiddenError('You can only download your own handover record');
    }

    const buffer = await renderHandoverPdf({
      companyName: assignment.tenant?.name ?? '',
      assetCode: assignment.asset.assetCode,
      assetName: assignment.asset.name,
      brand: assignment.asset.brand,
      model: assignment.asset.model,
      serialNumber: assignment.asset.serialNumber,
      conditionOut: assignment.conditionOut,
      assignedAt: assignment.assignedAt,
      note: assignment.note,
      recipient: {
        fullName: assignment.employee?.fullName ?? '—',
        employeeCode: assignment.employee?.employeeCode ?? '—',
      },
      handedOverBy: assignment.assignedBy
        ? { fullName: assignment.assignedBy.fullName, employeeCode: assignment.assignedBy.employeeCode }
        : null,
      ackStatus: assignment.ackStatus,
      ackMethod: assignment.ackMethod,
      acknowledgedAt: assignment.acknowledgedAt,
      signatureImage: assignment.signatureImage,
    });

    const filename = `bien-ban-ban-giao-${assignment.asset.assetCode}.pdf`;
    return { buffer, filename };
  },

  // Ảnh chữ ký (PNG) của một biên bản, phục vụ xem trực tiếp trên UI. Cùng cổng
  // quyền với PDF: chủ phiếu xem chữ ký của mình, hoặc người có assets:assign xem
  // bất kỳ. Ảnh chỉ rời server qua endpoint có phân quyền này (không qua DTO).
  // Biên bản chưa ký (PENDING) → 404 để client phân biệt với lỗi quyền.
  async getHandoverSignature(
    assignmentId: string,
    tenantId: string,
    viewer: { employeeId: string | null; canAssign: boolean },
  ): Promise<{ buffer: Buffer; assetCode: string }> {
    const assignment = await assetRepository.findAssignmentForHandover(assignmentId, tenantId);
    if (!assignment) {
      throw new NotFoundError('Handover record not found');
    }
    const isOwner = viewer.employeeId !== null && assignment.employeeId === viewer.employeeId;
    if (!isOwner && !viewer.canAssign) {
      throw new ForbiddenError('You can only view your own handover signature');
    }
    const buffer = decodeSignaturePng(assignment.signatureImage);
    if (!buffer) {
      throw new NotFoundError('No signature on this handover');
    }
    return { buffer, assetCode: assignment.asset.assetCode };
  },
};
