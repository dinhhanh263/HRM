import type { Prisma, PrismaClient } from '@prisma/client';
import type { AssetCondition } from '@hrm/shared';
import { db } from '../../infrastructure/database/client.js';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AssetFilters {
  search?: string;
  categoryId?: string;
  status?: string;
  assigneeId?: string;
  sortBy?: 'assetCode' | 'name' | 'status' | 'createdAt';
  order?: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

const employeeSummary = {
  select: { id: true, fullName: true, employeeCode: true, avatar: true },
};

const categorySummary = {
  select: { id: true, name: true, code: true, icon: true },
};

// List rows only need the compact category + the single ACTIVE assignment (holder).
const listInclude = {
  category: categorySummary,
  assignments: {
    where: { status: 'ACTIVE' as const },
    take: 1,
    include: { employee: employeeSummary, assignedBy: employeeSummary },
  },
} satisfies Prisma.AssetInclude;

// Detail carries full assignment + maintenance history.
const detailInclude = {
  category: categorySummary,
  assignments: {
    orderBy: { assignedAt: 'desc' as const },
    include: {
      employee: employeeSummary,
      assignedBy: employeeSummary,
      returnedBy: employeeSummary,
    },
  },
  maintenances: {
    orderBy: { startedAt: 'desc' as const },
    include: { createdBy: employeeSummary },
  },
} satisfies Prisma.AssetInclude;

// Translate list/export filters into a tenant-scoped Prisma where clause.
function buildAssetWhere(tenantId: string, filters: AssetFilters): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = { tenantId };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { assetCode: { contains: filters.search, mode: 'insensitive' } },
      { serialNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.status) {
    where.status = filters.status as Prisma.EnumAssetStatusFilter['equals'];
  }

  // "Currently held by employee X" — an ACTIVE assignment to that employee.
  if (filters.assigneeId) {
    where.assignments = {
      some: { employeeId: filters.assigneeId, status: 'ACTIVE' },
    };
  }

  return where;
}

function buildAssetOrderBy(filters: AssetFilters): Prisma.AssetOrderByWithRelationInput {
  return filters.sortBy ? { [filters.sortBy]: filters.order ?? 'asc' } : { createdAt: 'desc' };
}

export const assetRepository = {
  async findAll(
    tenantId: string,
    filters: AssetFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 },
  ) {
    const where = buildAssetWhere(tenantId, filters);
    const skip = (pagination.page - 1) * pagination.limit;
    const orderBy = buildAssetOrderBy(filters);

    const [assets, total] = await Promise.all([
      db.asset.findMany({ where, include: listInclude, orderBy, skip, take: pagination.limit }),
      db.asset.count({ where }),
    ]);

    return {
      data: assets,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  // Export honours the same filters/sort as the list but returns every matching
  // row (no pagination) — the caller streams these into a CSV.
  async findAllForExport(tenantId: string, filters: AssetFilters = {}) {
    return db.asset.findMany({
      where: buildAssetWhere(tenantId, filters),
      include: listInclude,
      orderBy: buildAssetOrderBy(filters),
    });
  },

  async findById(id: string, tenantId: string) {
    return db.asset.findFirst({ where: { id, tenantId }, include: detailInclude });
  },

  async findByAssetCode(assetCode: string, tenantId: string) {
    return db.asset.findFirst({ where: { assetCode, tenantId } });
  },

  // Assets currently held by an employee — an ACTIVE assignment to them.
  // Powers the EMPLOYEE self-service "Tài sản của tôi" view.
  async findHeldBy(employeeId: string, tenantId: string) {
    return db.asset.findMany({
      where: { tenantId, assignments: { some: { employeeId, status: 'ACTIVE' } } },
      include: listInclude,
      orderBy: { assetCode: 'asc' },
    });
  },

  // Atomic compare-and-set: flip AVAILABLE→ASSIGNED only if still AVAILABLE.
  // Returns the number of rows changed (1 = claimed, 0 = lost the race / not
  // available) so the caller can enforce the single-ACTIVE-assignment invariant.
  async claimForAssignment(tx: Tx, assetId: string, tenantId: string): Promise<number> {
    const result = await tx.asset.updateMany({
      where: { id: assetId, tenantId, status: 'AVAILABLE' },
      data: { status: 'ASSIGNED' },
    });
    return result.count;
  },

  // Inverse CAS: flip ASSIGNED→AVAILABLE only if still ASSIGNED.
  async releaseFromAssignment(tx: Tx, assetId: string, tenantId: string): Promise<number> {
    const result = await tx.asset.updateMany({
      where: { id: assetId, tenantId, status: 'ASSIGNED' },
      data: { status: 'AVAILABLE' },
    });
    return result.count;
  },

  async createAssignment(tx: Tx, data: Prisma.AssetAssignmentUncheckedCreateInput) {
    return tx.assetAssignment.create({ data });
  },

  // Single handover record, tenant-scoped, with the people needed to build a DTO.
  async findAssignmentById(assignmentId: string, tenantId: string) {
    return db.assetAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      include: {
        employee: employeeSummary,
        assignedBy: employeeSummary,
        returnedBy: employeeSummary,
      },
    });
  },

  // Full handover record for rendering the PDF "biên bản": carries the asset,
  // both parties, tenant company name, and the (server-only) signature image.
  async findAssignmentForHandover(assignmentId: string, tenantId: string) {
    return db.assetAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      include: {
        employee: employeeSummary,
        assignedBy: employeeSummary,
        asset: { select: { assetCode: true, name: true, brand: true, model: true, serialNumber: true } },
        tenant: { select: { name: true } },
      },
    });
  },

  // Atomic CAS: stamp the IN_APP acknowledgement only if the handover is still
  // ACTIVE + PENDING. Guards against a concurrent double-sign (TOCTOU) — two
  // racing requests can both pass the service pre-checks, but only one row write
  // wins here. Returns the affected-row count so the caller can detect the loser.
  async updateAssignmentAck(
    assignmentId: string,
    tenantId: string,
    data: {
      ackStatus: 'SIGNED';
      ackMethod: 'IN_APP';
      acknowledgedAt: Date;
      acknowledgedByUserId: string;
      signatureImage: string;
    },
  ): Promise<number> {
    const result = await db.assetAssignment.updateMany({
      where: { id: assignmentId, tenantId, status: 'ACTIVE', ackStatus: 'PENDING' },
      data,
    });
    return result.count;
  },

  // Atomic CAS: AVAILABLE→UNDER_MAINTENANCE only if still AVAILABLE. Guards the
  // single-open-maintenance invariant (you can only start from AVAILABLE).
  async claimForMaintenance(tx: Tx, assetId: string, tenantId: string): Promise<number> {
    const result = await tx.asset.updateMany({
      where: { id: assetId, tenantId, status: 'AVAILABLE' },
      data: { status: 'UNDER_MAINTENANCE' },
    });
    return result.count;
  },

  // Inverse CAS: UNDER_MAINTENANCE→AVAILABLE only if still under maintenance.
  async releaseFromMaintenance(tx: Tx, assetId: string, tenantId: string): Promise<number> {
    const result = await tx.asset.updateMany({
      where: { id: assetId, tenantId, status: 'UNDER_MAINTENANCE' },
      data: { status: 'AVAILABLE' },
    });
    return result.count;
  },

  async createMaintenance(tx: Tx, data: Prisma.AssetMaintenanceUncheckedCreateInput) {
    return tx.assetMaintenance.create({ data });
  },

  // Close the single open maintenance record (completedAt null). Returns rows changed.
  async completeOpenMaintenance(
    tx: Tx,
    assetId: string,
    tenantId: string,
    data: { completedAt: Date; description?: string; vendor?: string | null; cost?: number | null },
  ): Promise<number> {
    const result = await tx.assetMaintenance.updateMany({
      where: { assetId, tenantId, completedAt: null },
      data,
    });
    return result.count;
  },

  // Terminal disposal CAS: only from a non-terminal, non-assigned state
  // (AVAILABLE or UNDER_MAINTENANCE). Returns rows changed.
  async disposeAsset(
    tx: Tx,
    assetId: string,
    tenantId: string,
    data: { status: 'RETIRED' | 'LOST'; retiredAt: Date; retirementReason: string; retiredById: string },
  ): Promise<number> {
    const result = await tx.asset.updateMany({
      where: { id: assetId, tenantId, status: { in: ['AVAILABLE', 'UNDER_MAINTENANCE'] } },
      data,
    });
    return result.count;
  },

  // Close the single ACTIVE assignment on an asset. Returns rows changed.
  async closeActiveAssignment(
    tx: Tx,
    assetId: string,
    tenantId: string,
    data: { returnedAt: Date; returnedById: string; conditionIn: AssetCondition | null; note: string | null },
  ): Promise<number> {
    const result = await tx.assetAssignment.updateMany({
      where: { assetId, tenantId, status: 'ACTIVE' },
      data: { status: 'RETURNED', ...data },
    });
    return result.count;
  },

  async create(data: Prisma.AssetUncheckedCreateInput) {
    return db.asset.create({ data, include: listInclude });
  },

  async update(id: string, data: Prisma.AssetUncheckedUpdateInput) {
    return db.asset.update({ where: { id }, data, include: listInclude });
  },

  async delete(id: string) {
    return db.asset.delete({ where: { id } });
  },

  // Deletion is blocked once an asset has any assignment or maintenance record —
  // history must be preserved (use disposal instead of delete).
  async countHistory(assetId: string): Promise<number> {
    const [assignments, maintenances] = await Promise.all([
      db.assetAssignment.count({ where: { assetId } }),
      db.assetMaintenance.count({ where: { assetId } }),
    ]);
    return assignments + maintenances;
  },
};
