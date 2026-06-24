// SPEC-042: Purchase Request (Phiếu đề xuất mua hàng / Purchase Requisition).
// Mirror Payment Request (SPEC-041) nhưng có nhiều dòng hàng + VAT theo dòng +
// mã phiếu tự sinh (PR-YYYYMMDD-NNN). Tái dùng ApproverType / ApprovalDecision.
import type { ApproverType, ApprovalDecision } from './leave.js';
import type { IssuingEntityRefDto } from './issuing-entity.js';

// Vòng đời phiếu đề xuất mua hàng.
export const PurchaseRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED', // terminal — bị từ chối hẳn
  RETURNED: 'RETURNED', // trả về để sửa & gửi lại (không terminal)
  CANCELLED: 'CANCELLED',
  ORDERED: 'ORDERED', // terminal — đã phát hành PO cho nhà cung cấp
} as const;

export type PurchaseRequestStatus =
  (typeof PurchaseRequestStatus)[keyof typeof PurchaseRequestStatus];

// Phạm vi truy vấn danh sách phiếu.
export const PurchaseRequestScope = {
  MINE: 'mine', // phiếu của chính tôi
  REVIEW: 'review', // phiếu đang chờ tôi duyệt ở bước hiện tại
  ALL: 'all', // toàn tenant (cần purchase_request:approve)
} as const;

export type PurchaseRequestScope =
  (typeof PurchaseRequestScope)[keyof typeof PurchaseRequestScope];

export interface PurchaseRequestEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
}

// Một dòng hàng của phiếu (read DTO). Các giá trị tiền là chuỗi (Decimal serialize).
export interface PurchaseRequestItemDto {
  id: string;
  lineNo: number;
  sku: string | null;
  productName: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
}

// Một mục trên timeline phê duyệt của một phiếu.
export interface PurchaseRequestApprovalDto {
  id: string;
  round: number; // tăng mỗi lần phiếu bị trả về rồi nộp lại
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null; // người duyệt kỳ vọng (đã resolve); null nếu không xác định được
  decision: ApprovalDecision | null; // null = đang chờ
  decidedById: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
  decidedBy?: Pick<PurchaseRequestEmployeeDto, 'id' | 'fullName'> | null;
}

export interface PurchaseRequestAttachmentDto {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface PurchaseRequestDto {
  id: string;
  tenantId: string;
  employeeId: string;
  code: string;
  title: string;
  description: string | null;
  vendorName: string;
  expectedDeliveryDate: string | null;
  currency: string;
  status: PurchaseRequestStatus;

  // tổng tiền (Decimal serialize thành chuỗi để khỏi mất độ chính xác)
  subtotal: string;
  taxAmount: string;
  totalAmount: string;

  flowId: string | null;
  currentStep: number; // 1-based; bước đang chờ duyệt
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;

  orderedById: string | null;
  orderedAt: string | null;
  orderNote: string | null;

  // SPEC-043: pháp nhân phát hành — id đã chọn + snapshot trọn bộ (PDF dùng snapshot).
  issuingEntityId: string | null;
  issuingCompanyName: string | null;
  issuingAddress: string | null;
  issuingTaxCode: string | null;
  issuingPhone: string | null;
  issuingLogoUrl: string | null;

  createdAt: string;
  updatedAt: string;

  employee?: PurchaseRequestEmployeeDto | null;
  // Light ref tới entity hiện tại (có thể đã ẩn/sửa) — null nếu không chọn / không còn.
  issuingEntity?: IssuingEntityRefDto | null;
  reviewedBy?: Pick<PurchaseRequestEmployeeDto, 'id' | 'fullName'> | null;
  orderedBy?: Pick<PurchaseRequestEmployeeDto, 'id' | 'fullName'> | null;
  items?: PurchaseRequestItemDto[];
  approvals?: PurchaseRequestApprovalDto[]; // timeline phê duyệt
  attachments?: PurchaseRequestAttachmentDto[];
}

// ── Request bodies ──────────────────────────────────────────────────────────

// Một dòng hàng người dùng nhập. Tiền tổng (lineSubtotal/...) server tính lại,
// không nhận từ client.
export interface PurchaseRequestItemInput {
  sku?: string | null;
  productName: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate?: number; // default 8
}

export interface CreatePurchaseRequestRequest {
  title: string;
  description?: string | null;
  vendorName: string;
  expectedDeliveryDate?: string | null;
  currency?: string;
  issuingEntityId?: string | null; // SPEC-043: pháp nhân phát hành (tùy chọn)
  items: PurchaseRequestItemInput[]; // ≥ 1 dòng
}

export type UpdatePurchaseRequestRequest = CreatePurchaseRequestRequest;

// "Trả về" và "Từ chối" dùng chung một endpoint, phân biệt bằng `mode`; note bắt buộc.
export interface RejectPurchaseRequestRequest {
  mode: 'return' | 'reject'; // return → RETURNED (sửa lại); reject → REJECTED (terminal)
  note: string;
}

export interface ApprovePurchaseRequestRequest {
  note?: string | null;
}

export interface MarkOrderedPurchaseRequestRequest {
  orderNote?: string | null; // số PO / ghi chú
}

export interface PurchaseRequestListQuery {
  scope?: PurchaseRequestScope;
  status?: PurchaseRequestStatus;
  vendorName?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Trả về kèm tổng tiền của tập kết quả (theo bộ lọc hiện tại) cho Founder nắm tổng.
export interface PurchaseRequestListResponse {
  items: PurchaseRequestDto[];
  total: number;
  page: number;
  limit: number;
  totalAmount: string; // tổng `totalAmount` của toàn bộ kết quả khớp filter
}

// ── Statistics (company-wide, theo năm) ─────────────────────────────────────

export interface PurchaseStatsMonthly {
  month: number; // 1–12
  total: string; // tổng totalAmount các phiếu tạo trong tháng
  count: number;
}

export interface PurchaseStatsGroup {
  key: string; // PurchaseRequestStatus, departmentName, hoặc vendorName
  total: string;
  count: number;
}

export interface PurchaseStatsResponse {
  year: number;
  months: PurchaseStatsMonthly[]; // luôn đủ 12 phần tử (tháng 1→12)
  byStatus: PurchaseStatsGroup[];
  byDepartment: PurchaseStatsGroup[]; // top phòng ban theo chi phí
  byVendor: PurchaseStatsGroup[]; // top nhà cung cấp theo chi phí
  grandTotal: string; // tổng tất cả phiếu trong năm
  grandCount: number;
  orderedTotal: string; // tổng đã đặt hàng (status = ORDERED)
  pendingTotal: string; // tổng đang chờ duyệt (status = PENDING)
}
