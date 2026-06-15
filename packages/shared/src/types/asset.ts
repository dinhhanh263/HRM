// Trạng thái vòng đời của một tài sản. AVAILABLE/ASSIGNED/UNDER_MAINTENANCE là
// các trạng thái hoạt động; RETIRED (thanh lý) và LOST (mất/hỏng) là terminal.
export const AssetStatus = {
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  UNDER_MAINTENANCE: 'UNDER_MAINTENANCE',
  RETIRED: 'RETIRED',
  LOST: 'LOST',
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetAssignmentStatus = {
  ACTIVE: 'ACTIVE', // đang được giữ
  RETURNED: 'RETURNED', // đã trả lại
} as const;

export type AssetAssignmentStatus =
  (typeof AssetAssignmentStatus)[keyof typeof AssetAssignmentStatus];

// Tình trạng tài sản, ghi nhận khi giao/nhận lại và trên hồ sơ tài sản.
export const AssetCondition = {
  NEW: 'NEW',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR',
} as const;

export type AssetCondition = (typeof AssetCondition)[keyof typeof AssetCondition];

// Trạng thái ký biên bản bàn giao: PENDING (chờ ký) → SIGNED (đã ký).
export const AssetAckStatus = {
  PENDING: 'PENDING',
  SIGNED: 'SIGNED',
} as const;

export type AssetAckStatus = (typeof AssetAckStatus)[keyof typeof AssetAckStatus];

// Phương thức ký: ON_SCREEN (vẽ tay trên màn hình lúc bàn giao trực tiếp) hoặc
// IN_APP (người nhận tự xác nhận từ xa qua tài khoản).
export const AssetAckMethod = {
  ON_SCREEN: 'ON_SCREEN',
  IN_APP: 'IN_APP',
} as const;

export type AssetAckMethod = (typeof AssetAckMethod)[keyof typeof AssetAckMethod];

// ── Category (loại tài sản, cấu hình theo tenant) ──────────────────────────

export interface AssetCategoryDto {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  icon: string | null; // tên Lucide icon (tùy chọn)
  assetCount: number; // số tài sản thuộc loại — phục vụ list + chặn xoá
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetCategoryInput {
  name: string;
  code: string;
  description?: string | null;
  icon?: string | null;
}

export interface UpdateAssetCategoryInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
}

// ── Người liên quan (hiển thị gọn trên UI) ─────────────────────────────────

export interface AssetEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
}

// ── Assignment (cấp phát / thu hồi) ────────────────────────────────────────

export interface AssetAssignmentDto {
  id: string;
  assetId: string;
  employeeId: string;
  status: AssetAssignmentStatus;
  assignedAt: string;
  assignedById: string;
  conditionOut: AssetCondition | null;
  returnedAt: string | null;
  returnedById: string | null;
  conditionIn: AssetCondition | null;
  note: string | null;
  createdAt: string;
  employee?: AssetEmployeeDto | null;
  assignedBy?: AssetEmployeeDto | null;
  returnedBy?: AssetEmployeeDto | null;
  // Biên bản bàn giao: trạng thái ký + danh tính + thời điểm. signatureImage KHÔNG
  // được trả ở đây (PII) — chỉ cờ hasSignature cho biết đã có chữ ký hay chưa.
  ackStatus: AssetAckStatus;
  ackMethod: AssetAckMethod | null;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  hasSignature: boolean;
}

export interface AssignAssetInput {
  employeeId: string;
  assignedAt: string;
  conditionOut?: AssetCondition | null;
  note?: string | null;
  // Chữ ký vẽ tay (PNG data URL) khi HR lấy chữ ký tại chỗ lúc cấp phát. Có chữ ký
  // → assignment được tạo ở trạng thái SIGNED/ON_SCREEN; không có → PENDING (ký sau).
  signature?: string | null;
  ackMethod?: AssetAckMethod | null;
}

// Người nhận (hoặc HR lấy chữ ký hộ tại chỗ) ký xác nhận một biên bản đang chờ ký.
export interface AcknowledgeHandoverInput {
  signature: string; // PNG data URL
}

export interface ReturnAssetInput {
  returnedAt: string;
  conditionIn?: AssetCondition | null;
  note?: string | null;
}

// ── Maintenance (bảo trì / sửa chữa) ───────────────────────────────────────

export interface AssetMaintenanceDto {
  id: string;
  assetId: string;
  startedAt: string;
  completedAt: string | null;
  cost: number | null;
  vendor: string | null;
  description: string;
  createdById: string;
  createdAt: string;
  createdBy?: AssetEmployeeDto | null;
}

export interface CreateMaintenanceInput {
  startedAt: string;
  description: string;
  vendor?: string | null;
  cost?: number | null;
}

export interface CompleteMaintenanceInput {
  completedAt: string;
  description?: string;
  vendor?: string | null;
  cost?: number | null;
}

// ── Asset (tài sản) ────────────────────────────────────────────────────────

export interface AssetDto {
  id: string;
  tenantId: string;
  categoryId: string;
  assetCode: string;
  name: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  status: AssetStatus;
  condition: AssetCondition | null;
  purchaseDate: string | null;
  purchaseCost: number | null; // tham chiếu (VND), không tính khấu hao
  warrantyEndDate: string | null;
  vendor: string | null;
  location: string | null;
  note: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
  retiredById: string | null;
  createdAt: string;
  updatedAt: string;
  category?: Pick<AssetCategoryDto, 'id' | 'name' | 'code' | 'icon'> | null;
  // assignment ACTIVE hiện tại (nếu có) — tính qua query, không denormalize.
  currentAssignment?: AssetAssignmentDto | null;
}

// Chi tiết tài sản kèm lịch sử đầy đủ — dùng cho trang chi tiết.
export interface AssetDetailDto extends AssetDto {
  assignments: AssetAssignmentDto[];
  maintenances: AssetMaintenanceDto[];
}

export interface CreateAssetInput {
  categoryId: string;
  assetCode: string;
  name: string;
  serialNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: AssetCondition | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  warrantyEndDate?: string | null;
  vendor?: string | null;
  location?: string | null;
  note?: string | null;
}

export interface UpdateAssetInput {
  categoryId?: string;
  assetCode?: string;
  name?: string;
  serialNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: AssetCondition | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  warrantyEndDate?: string | null;
  vendor?: string | null;
  location?: string | null;
  note?: string | null;
}

export interface DisposeAssetInput {
  // Chỉ nhận trạng thái terminal.
  status: typeof AssetStatus.RETIRED | typeof AssetStatus.LOST;
  reason: string;
  retiredAt: string;
}

export interface AssetListParams {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: AssetStatus;
  assigneeId?: string; // lọc theo nhân viên đang giữ
  search?: string;
  sortBy?: 'assetCode' | 'name' | 'status' | 'createdAt';
  order?: 'asc' | 'desc';
}
