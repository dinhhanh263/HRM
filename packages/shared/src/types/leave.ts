export const LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  // RETURNED = trả về cho nhân viên sửa lại & nộp lại (KHÔNG terminal, khác REJECTED).
  RETURNED: 'RETURNED',
} as const;

export type LeaveStatus = (typeof LeaveStatus)[keyof typeof LeaveStatus];

// Loại người duyệt cho mỗi bước trong luồng phê duyệt cấu hình được.
export const ApproverType = {
  MANAGER: 'MANAGER', // quản lý trực tiếp của nhân viên
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD', // trưởng phòng ban của nhân viên
  ROLE: 'ROLE', // bất kỳ ai có roleKey/capability (vd HR_MANAGER)
  SPECIFIC_USER: 'SPECIFIC_USER', // một nhân viên cụ thể
} as const;

export type ApproverType = (typeof ApproverType)[keyof typeof ApproverType];

// Quyết định đã ghi lại trên một bước phê duyệt.
export const ApprovalDecision = {
  APPROVED: 'APPROVED',
  RETURNED: 'RETURNED', // trả về NV sửa lại
  AUTO_SKIPPED: 'AUTO_SKIPPED', // bỏ qua tự động (không tìm được người duyệt / tự duyệt chính mình)
  REJECTED: 'REJECTED', // SPEC-041: từ chối terminal (chỉ Payment dùng; Leave/OT chỉ dùng RETURNED)
} as const;

export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

// Phân biệt luồng duyệt theo nghiệp vụ. Cùng cấu trúc ApprovalFlow/ApprovalStep
// nhưng Leave và Overtime cấu hình độc lập nhau.
export const ApprovalFlowType = {
  LEAVE: 'LEAVE',
  OVERTIME: 'OVERTIME',
  PAYMENT: 'PAYMENT', // SPEC-041
  PURCHASE: 'PURCHASE', // SPEC-042
  KPI_REVIEW: 'KPI_REVIEW', // SPEC-044
} as const;

export type ApprovalFlowType = (typeof ApprovalFlowType)[keyof typeof ApprovalFlowType];

// Stable codes for the 5 default leave types seeded per tenant. Tenants may add
// more types with arbitrary codes; these are just the defaults.
export const DEFAULT_LEAVE_TYPE_CODES = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  PERSONAL: 'PERSONAL',
  UNPAID: 'UNPAID',
  MATERNITY: 'MATERNITY',
} as const;

export interface LeaveTypeDto {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  colorHex: string | null;
  defaultDays: number;
  paid: boolean;
  requiresAttachment: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequestEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
}

// ── Approval flow (luồng phê duyệt cấu hình được) ──────────────────────────

export interface ApprovalStepDto {
  id: string;
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null; // khi approverType = ROLE
  approverId: string | null; // khi approverType = SPECIFIC_USER
  // Tên hiển thị của người duyệt cụ thể (chỉ khi SPECIFIC_USER), tiện cho UI.
  approver?: Pick<LeaveRequestEmployeeDto, 'id' | 'fullName' | 'employeeCode'> | null;
}

// SPEC-046: một CC/người theo dõi của flow. Chỉ ROLE | SPECIFIC_USER.
export interface ApprovalWatcherDto {
  id: string;
  watcherType: Extract<ApproverType, 'ROLE' | 'SPECIFIC_USER'>;
  roleKey: string | null; // khi watcherType = ROLE
  watcherId: string | null; // khi watcherType = SPECIFIC_USER (Employee.id)
  // Tên hiển thị của người theo dõi cụ thể (chỉ khi SPECIFIC_USER), tiện cho UI.
  watcher?: Pick<LeaveRequestEmployeeDto, 'id' | 'fullName' | 'employeeCode'> | null;
}

export interface ApprovalFlowDto {
  id: string;
  tenantId: string;
  departmentId: string | null; // null = luồng mặc định của tenant
  departmentName: string | null;
  flowType: ApprovalFlowType;
  name: string;
  active: boolean;
  steps: ApprovalStepDto[];
  watchers: ApprovalWatcherDto[]; // SPEC-046: CC/người theo dõi (chỉ xem)
  createdAt: string;
  updatedAt: string;
}

// Một mục trên timeline phê duyệt của một đơn nghỉ.
export interface LeaveApprovalDto {
  id: string;
  round: number; // tăng mỗi lần đơn bị trả về rồi nộp lại
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null; // người duyệt kỳ vọng (đã resolve); null nếu không xác định được
  decision: ApprovalDecision | null; // null = đang chờ
  decidedById: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
  decidedBy?: Pick<LeaveRequestEmployeeDto, 'id' | 'fullName'> | null;
}

export interface LeaveRequestDto {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  totalDays: number;
  reason: string | null;
  attachmentUrl: string | null;
  status: LeaveStatus;
  flowId: string | null; // null = đơn legacy (single-step SPEC-004) hoặc chưa có luồng
  currentStep: number; // 0-based; bước đang chờ duyệt trong luồng
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  leaveType?: Pick<LeaveTypeDto, 'id' | 'name' | 'code' | 'colorHex' | 'paid'> | null;
  employee?: LeaveRequestEmployeeDto | null;
  reviewedBy?: Pick<LeaveRequestEmployeeDto, 'id' | 'fullName'> | null;
  approvals?: LeaveApprovalDto[]; // timeline phê duyệt (khi đơn dùng luồng cấu hình)
  // SPEC-046: true khi actor chỉ xem đơn với tư cách CC/người theo dõi (không được duyệt).
  watchOnly?: boolean;
}

export interface LeaveBalanceDto {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  colorHex: string | null;
  paid: boolean;
  year: number;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
}

/** Minimal leave-type shape used as a stable column descriptor in the roster. */
export interface LeaveTypeSummaryDto {
  id: string;
  name: string;
  code: string;
  colorHex: string | null;
  paid: boolean;
}

/** One employee row in the company-wide leave balance roster. */
export interface LeaveBalanceRosterRowDto {
  employee: LeaveRequestEmployeeDto;
  /** Balances aligned with the response's `leaveTypes` column order. */
  balances: LeaveBalanceDto[];
}

export interface LeaveBalanceRosterResponse {
  data: LeaveBalanceRosterRowDto[];
  /** Column descriptors (active leave types), in display order. */
  leaveTypes: LeaveTypeSummaryDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SetLeaveBalanceRequest {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocated: number;
}

export interface CreateLeaveTypeRequest {
  name: string;
  code: string;
  colorHex?: string | null;
  defaultDays?: number;
  paid?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
}

export interface UpdateLeaveTypeRequest {
  name?: string;
  colorHex?: string | null;
  defaultDays?: number;
  paid?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
}

export interface CreateLeaveRequestRequest {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  reason?: string;
  attachmentUrl?: string;
}

export interface RejectLeaveRequestRequest {
  note?: string;
}

export interface LeaveRequestListQuery {
  page?: number;
  limit?: number;
  // 'mine' = đơn của tôi; 'review' = đơn tôi cần duyệt; 'all' = toàn tenant (HR/Admin);
  // 'watching' = đơn tôi được CC/theo dõi (chỉ xem, SPEC-046).
  scope?: 'mine' | 'review' | 'all' | 'watching';
  status?: LeaveStatus;
  leaveTypeId?: string;
  year?: number;
  search?: string;
}

// ── Approval flow config requests (Phase 3 CRUD) ───────────────────────────

export interface ApprovalStepInput {
  approverType: ApproverType;
  roleKey?: string | null; // bắt buộc khi approverType = ROLE
  approverId?: string | null; // bắt buộc khi approverType = SPECIFIC_USER
}

// SPEC-046: đầu vào cấu hình một CC/người theo dõi.
export interface WatcherInput {
  watcherType: Extract<ApproverType, 'ROLE' | 'SPECIFIC_USER'>;
  roleKey?: string | null; // bắt buộc khi watcherType = ROLE
  watcherId?: string | null; // bắt buộc khi watcherType = SPECIFIC_USER
}

export interface CreateApprovalFlowRequest {
  departmentId?: string | null; // null/undefined = luồng mặc định của tenant
  name: string;
  active?: boolean;
  steps: ApprovalStepInput[]; // thứ tự mảng = stepOrder (0-based)
  watchers?: WatcherInput[]; // SPEC-046: danh sách CC (có thể rỗng)
}

export interface UpdateApprovalFlowRequest {
  name?: string;
  active?: boolean;
  steps?: ApprovalStepInput[]; // nếu có, thay thế toàn bộ các bước
  watchers?: WatcherInput[]; // nếu có, thay thế toàn bộ danh sách CC
}

// ── Tenant leave settings (cấu hình nghỉ phép cấp công ty) ─────────────────

// Cấu hình nghỉ phép cấp tenant. Hiện chỉ có công tắc pro-rata cho nhân viên mới.
export interface LeaveSettingsDto {
  // Khi bật: lúc tạo nhân viên, hệ thống tự pro-rata phép năm theo tháng vào làm.
  proRataEnabled: boolean;
}

export interface UpdateLeaveSettingsRequest {
  proRataEnabled: boolean;
}

// Hành động phê duyệt/trả về trên một đơn nghỉ dùng luồng cấu hình.
export interface ApproveLeaveRequestRequest {
  note?: string;
}

export interface ReturnLeaveRequestRequest {
  note?: string; // lý do trả về để NV sửa
}
