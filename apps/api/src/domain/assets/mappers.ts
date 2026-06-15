import type {
  AssetCategory,
  Asset,
  AssetAssignment,
  AssetMaintenance,
  Employee,
  Prisma,
} from '@prisma/client';
import type {
  AssetCategoryDto,
  AssetDto,
  AssetDetailDto,
  AssetAssignmentDto,
  AssetMaintenanceDto,
  AssetEmployeeDto,
  AssetStatus,
  AssetCondition,
  AssetAckStatus,
  AssetAckMethod,
} from '@hrm/shared';

type AssetCategoryWithCount = AssetCategory & { _count?: { assets: number } };

export function toCategoryDto(c: AssetCategoryWithCount): AssetCategoryDto {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    code: c.code,
    description: c.description,
    icon: c.icon,
    assetCount: c._count?.assets ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// Decimal → number (purchaseCost/cost are reference values, not used for math).
function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

type EmployeeSummary = Pick<Employee, 'id' | 'fullName' | 'employeeCode' | 'avatar'>;

function toEmployeeDto(e: EmployeeSummary | null | undefined): AssetEmployeeDto | null {
  if (!e) return null;
  return {
    id: e.id,
    fullName: e.fullName,
    employeeCode: e.employeeCode,
    avatar: e.avatar,
  };
}

type AssignmentWithPeople = AssetAssignment & {
  employee?: EmployeeSummary | null;
  assignedBy?: EmployeeSummary | null;
  returnedBy?: EmployeeSummary | null;
};

export function toAssignmentDto(a: AssignmentWithPeople): AssetAssignmentDto {
  return {
    id: a.id,
    assetId: a.assetId,
    employeeId: a.employeeId,
    status: a.status as AssetAssignmentDto['status'],
    assignedAt: a.assignedAt.toISOString(),
    assignedById: a.assignedById,
    conditionOut: a.conditionOut as AssetCondition | null,
    returnedAt: a.returnedAt ? a.returnedAt.toISOString() : null,
    returnedById: a.returnedById,
    conditionIn: a.conditionIn as AssetCondition | null,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
    employee: toEmployeeDto(a.employee),
    assignedBy: toEmployeeDto(a.assignedBy),
    returnedBy: toEmployeeDto(a.returnedBy),
    // Ack metadata — signatureImage (PII) is intentionally NOT exposed; only the
    // hasSignature flag tells the client whether a signature is on file.
    ackStatus: a.ackStatus as AssetAckStatus,
    ackMethod: a.ackMethod as AssetAckMethod | null,
    acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
    acknowledgedByUserId: a.acknowledgedByUserId,
    hasSignature: a.signatureImage != null,
  };
}

type MaintenanceWithCreator = AssetMaintenance & { createdBy?: EmployeeSummary | null };

export function toMaintenanceDto(m: MaintenanceWithCreator): AssetMaintenanceDto {
  return {
    id: m.id,
    assetId: m.assetId,
    startedAt: m.startedAt.toISOString(),
    completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    cost: decimalToNumber(m.cost),
    vendor: m.vendor,
    description: m.description,
    createdById: m.createdById,
    createdAt: m.createdAt.toISOString(),
    createdBy: toEmployeeDto(m.createdBy),
  };
}

type CategorySummary = Pick<AssetCategory, 'id' | 'name' | 'code' | 'icon'>;

type AssetWithRelations = Asset & {
  category?: CategorySummary | null;
  assignments?: AssignmentWithPeople[];
  maintenances?: MaintenanceWithCreator[];
};

export function toAssetDto(a: AssetWithRelations): AssetDto {
  // The current holder is the single ACTIVE assignment, if any.
  const active = a.assignments?.find((x) => x.status === 'ACTIVE') ?? null;
  return {
    id: a.id,
    tenantId: a.tenantId,
    categoryId: a.categoryId,
    assetCode: a.assetCode,
    name: a.name,
    serialNumber: a.serialNumber,
    brand: a.brand,
    model: a.model,
    status: a.status as AssetStatus,
    condition: a.condition as AssetCondition | null,
    purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString() : null,
    purchaseCost: decimalToNumber(a.purchaseCost),
    warrantyEndDate: a.warrantyEndDate ? a.warrantyEndDate.toISOString() : null,
    vendor: a.vendor,
    location: a.location,
    note: a.note,
    retiredAt: a.retiredAt ? a.retiredAt.toISOString() : null,
    retirementReason: a.retirementReason,
    retiredById: a.retiredById,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    category: a.category
      ? { id: a.category.id, name: a.category.name, code: a.category.code, icon: a.category.icon }
      : null,
    currentAssignment: active ? toAssignmentDto(active) : null,
  };
}

export function toAssetDetailDto(a: AssetWithRelations): AssetDetailDto {
  return {
    ...toAssetDto(a),
    assignments: (a.assignments ?? []).map(toAssignmentDto),
    maintenances: (a.maintenances ?? []).map(toMaintenanceDto),
  };
}
