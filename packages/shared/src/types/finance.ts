// SPEC-048: Ngân sách & Dòng tiền (Budget & Cash Flow) — GĐ1 (MVP).
// Tiền tệ serialize dưới dạng `string` (Prisma Decimal) để không mất chính xác.

export type TransactionDirection = 'IN' | 'OUT';
export type TransactionStatus = 'ACTUAL' | 'PLANNED';
export type CategoryKind = 'INCOME' | 'EXPENSE';
export type FundAccountType = 'BANK' | 'CASH' | 'EWALLET';
export type TransactionSource =
  | 'MANUAL'
  | 'IMPORT'
  | 'PAYMENT_REQUEST'
  | 'PURCHASE_REQUEST'
  | 'PAYROLL';

// ── Fund Account ────────────────────────────────────────────────────────────

export interface FundAccountDto {
  id: string;
  issuingEntityId: string;
  issuingEntityName: string;
  name: string;
  type: FundAccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundAccountRequest {
  issuingEntityId: string;
  name: string;
  type: FundAccountType;
  currency?: string;
  openingBalance?: number;
}

export interface UpdateFundAccountRequest {
  name?: string;
  type?: FundAccountType;
  currency?: string;
  openingBalance?: number;
  active?: boolean;
}

export interface FundAccountListQuery {
  issuingEntityId?: string;
  active?: boolean;
}

// ── Finance Category ─────────────────────────────────────────────────────────

export interface FinanceCategoryDto {
  id: string;
  kind: CategoryKind;
  name: string;
  parentId: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateFinanceCategoryRequest {
  kind: CategoryKind;
  name: string;
  parentId?: string | null;
}

export interface UpdateFinanceCategoryRequest {
  name?: string;
  parentId?: string | null;
  active?: boolean;
}

export interface FinanceCategoryListQuery {
  kind?: CategoryKind;
  active?: boolean;
}

// ── Cash Transaction ──────────────────────────────────────────────────────────

export interface CashTransactionDto {
  id: string;
  accountId: string;
  accountName: string;
  issuingEntityId: string;
  issuingEntityName: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount: string;
  currency: string;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  description: string | null;
  reference: string | null;
  source: TransactionSource;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashTransactionRequest {
  accountId: string;
  direction: TransactionDirection;
  status?: TransactionStatus;
  amount: number;
  occurredAt: string;
  categoryId?: string | null;
  departmentId?: string | null;
  description?: string | null;
  reference?: string | null;
}

export type UpdateCashTransactionRequest = Partial<CreateCashTransactionRequest>;

export interface CashTransactionListQuery {
  issuingEntityId?: string;
  accountId?: string;
  categoryId?: string;
  departmentId?: string;
  direction?: TransactionDirection;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Kèm tổng IN/OUT/net (ACTUAL) của toàn bộ tập kết quả khớp filter.
export interface CashTransactionListResponse {
  items: CashTransactionDto[];
  total: number;
  page: number;
  limit: number;
  totalIn: string;
  totalOut: string;
  net: string;
}
