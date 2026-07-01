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

// ── Excel/CSV import (stateless parse → preview → confirm) ────────────────────

export const CASH_TX_IMPORT_COLUMNS = [
  'account',
  'direction',
  'amount',
  'date',
  'category',
  'department',
  'reference',
  'description',
] as const;
export type CashTxImportColumn = (typeof CASH_TX_IMPORT_COLUMNS)[number];

// account / direction / amount / date are required; the rest optional.
export const REQUIRED_CASH_TX_IMPORT_COLUMNS: readonly CashTxImportColumn[] = [
  'account',
  'direction',
  'amount',
  'date',
];

export type CashTxImportLang = 'vi' | 'en';

export interface CashTxImportRowError {
  row: number; // 0 = file-level
  column: CashTxImportColumn | null;
  code: string;
  message: string;
}

export type ParsedCashTxRow = { rowNumber: number } & Record<CashTxImportColumn, string>;

export interface CashTxImportPreviewRow {
  rowNumber: number;
  data: ParsedCashTxRow;
  errors: CashTxImportRowError[];
}

// Response of POST /cash-transactions/import/parse (nothing persisted yet).
export interface CashTxImportParseResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  fileErrors: CashTxImportRowError[];
  rows: CashTxImportPreviewRow[];
}

// Response of POST /cash-transactions/import/confirm.
export interface CashTxImportConfirmResult {
  created: number;
  skipped: number;
}

// ── Dashboard (MVP) ───────────────────────────────────────────────────────────

export interface FinanceDashboardQuery {
  issuingEntityId?: string;
  month?: string; // "YYYY-MM"; defaults to the current month
}

export interface FinanceDashboardDay {
  date: string; // "YYYY-MM-DD"
  in: string;
  out: string;
}

export interface FinanceDashboardCategory {
  categoryId: string | null;
  name: string;
  total: string;
}

export interface FinanceDashboardResponse {
  period: string; // "YYYY-MM"
  totalBalance: string; // current balance across matching accounts (as of now)
  totalIn: string; // ACTUAL IN within the period
  totalOut: string; // ACTUAL OUT within the period
  net: string;
  series: FinanceDashboardDay[]; // daily ACTUAL in/out across the period
  byCategory: FinanceDashboardCategory[]; // top expense categories within the period
}
