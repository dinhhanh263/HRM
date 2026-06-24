// SPEC-041: Payment Request (Yêu cầu thanh toán / hoàn ứng).
// Tái dùng ApproverType / ApprovalDecision của luồng duyệt chung (leave.ts).
import type { ApproverType, ApprovalDecision } from './leave.js';

// Loại yêu cầu thanh toán.
export const PaymentRequestType = {
  REIMBURSEMENT: 'REIMBURSEMENT', // hoàn ứng — đã chi, xin lại tiền
  ADVANCE: 'ADVANCE', // tạm ứng — xin tiền trước khi chi
  VENDOR_PAYMENT: 'VENDOR_PAYMENT', // thanh toán nhà cung cấp theo hoá đơn đỏ
} as const;

export type PaymentRequestType = (typeof PaymentRequestType)[keyof typeof PaymentRequestType];

// Vòng đời đơn thanh toán.
export const PaymentRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED', // terminal — bị từ chối hẳn
  RETURNED: 'RETURNED', // trả về để sửa & gửi lại (không terminal)
  CANCELLED: 'CANCELLED',
  PAID: 'PAID', // terminal — đã thanh toán
} as const;

export type PaymentRequestStatus =
  (typeof PaymentRequestStatus)[keyof typeof PaymentRequestStatus];

// Phạm vi truy vấn danh sách đơn.
export const PaymentRequestScope = {
  MINE: 'mine', // đơn của chính tôi
  REVIEW: 'review', // đơn đang chờ tôi duyệt ở bước hiện tại
  ALL: 'all', // toàn tenant (cần payment_request:approve)
} as const;

export type PaymentRequestScope =
  (typeof PaymentRequestScope)[keyof typeof PaymentRequestScope];

export interface PaymentRequestEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
}

// Một mục trên timeline phê duyệt của một đơn thanh toán.
export interface PaymentRequestApprovalDto {
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
  decidedBy?: Pick<PaymentRequestEmployeeDto, 'id' | 'fullName'> | null;
}

export interface PaymentRequestAttachmentDto {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface PaymentRequestDto {
  id: string;
  tenantId: string;
  employeeId: string;
  type: PaymentRequestType;
  title: string;
  description: string | null;
  amount: string; // Decimal serialize thành chuỗi để khỏi mất độ chính xác
  currency: string;
  status: PaymentRequestStatus;

  // field tuỳ-loại
  expenseDate: string | null;
  category: string | null;
  neededByDate: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;

  flowId: string | null;
  currentStep: number; // 1-based; bước đang chờ duyệt
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;

  paidById: string | null;
  paidAt: string | null;
  paymentNote: string | null;

  createdAt: string;
  updatedAt: string;

  employee?: PaymentRequestEmployeeDto | null;
  reviewedBy?: Pick<PaymentRequestEmployeeDto, 'id' | 'fullName'> | null;
  paidBy?: Pick<PaymentRequestEmployeeDto, 'id' | 'fullName'> | null;
  approvals?: PaymentRequestApprovalDto[]; // timeline phê duyệt
  attachments?: PaymentRequestAttachmentDto[];
}

// ── Request bodies ──────────────────────────────────────────────────────────

export interface CreatePaymentRequestRequest {
  type: PaymentRequestType;
  title: string;
  description?: string | null;
  amount: number;
  currency?: string;
  // tuỳ-loại (validate theo type ở server)
  expenseDate?: string | null;
  category?: string | null;
  neededByDate?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  dueDate?: string | null;
}

export type UpdatePaymentRequestRequest = Partial<CreatePaymentRequestRequest>;

// Một thân request cho cả "trả về" và "từ chối", phân biệt bằng `mode`.
export interface RejectPaymentRequestRequest {
  mode: 'return' | 'reject'; // return → RETURNED (sửa lại); reject → REJECTED (terminal)
  note: string; // bắt buộc
}

export interface ApprovePaymentRequestRequest {
  note?: string | null;
}

export interface MarkPaidPaymentRequestRequest {
  paymentNote?: string | null;
}

export interface PaymentRequestListQuery {
  scope?: PaymentRequestScope;
  status?: PaymentRequestStatus;
  type?: PaymentRequestType;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Trả về kèm tổng tiền của tập kết quả (theo bộ lọc hiện tại) cho Founder nắm tổng khoản.
export interface PaymentRequestListResponse {
  items: PaymentRequestDto[];
  total: number;
  page: number;
  limit: number;
  totalAmount: string; // tổng `amount` của toàn bộ kết quả khớp filter
}

// ── Statistics (company-wide, theo năm) ─────────────────────────────────────

export interface PaymentStatsMonthly {
  month: number; // 1–12
  total: string; // tổng amount các đơn tạo trong tháng
  count: number;
}

export interface PaymentStatsGroup {
  key: string; // PaymentRequestType hoặc PaymentRequestStatus
  total: string;
  count: number;
}

export interface PaymentStatsResponse {
  year: number;
  months: PaymentStatsMonthly[]; // luôn đủ 12 phần tử (tháng 1→12)
  byType: PaymentStatsGroup[];
  byStatus: PaymentStatsGroup[];
  grandTotal: string; // tổng tất cả đơn trong năm
  grandCount: number;
  paidTotal: string; // tổng đã thanh toán (status = PAID)
  pendingTotal: string; // tổng đang chờ duyệt (status = PENDING)
}
