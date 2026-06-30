// SPEC-045: Sales / CRM shared types. Mirror Prisma enums as string-literal
// objects (the shared package must not depend on @prisma/client). Money is
// serialized as string (Decimal). Two independent axes: Customer.lifecycleStatus
// (is this lead worth pursuing?) vs Deal.stage (how far is a given deal?).

export const CustomerType = { B2B: 'B2B', B2C: 'B2C' } as const;
export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];

export const CustomerLifecycle = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  CONVERTED: 'CONVERTED',
  CUSTOMER: 'CUSTOMER',
  DISQUALIFIED: 'DISQUALIFIED',
} as const;
export type CustomerLifecycle = (typeof CustomerLifecycle)[keyof typeof CustomerLifecycle];

export const LeadSource = {
  WEB: 'WEB',
  REFERRAL: 'REFERRAL',
  COLD_CALL: 'COLD_CALL',
  COLD_EMAIL: 'COLD_EMAIL',
  EVENT: 'EVENT',
  SOCIAL: 'SOCIAL',
  ADVERTISING: 'ADVERTISING',
  PARTNER: 'PARTNER',
  IMPORT: 'IMPORT',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export interface CustomerOwnerRef {
  id: string;
  fullName: string;
}

export interface CustomerCompanyRef {
  id: string;
  name: string;
}

export interface CustomerDto {
  id: string;
  type: CustomerType;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  source: LeadSource;
  lifecycleStatus: CustomerLifecycle;
  lostReason: string | null;
  notes: string | null;
  ownerId: string | null;
  owner: CustomerOwnerRef | null;
  companyId: string | null;
  company: CustomerCompanyRef | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerRequest {
  type: CustomerType;
  fullName: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  source?: LeadSource;
  companyId?: string | null;
  notes?: string;
}

export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

export interface ListCustomersQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: CustomerType;
  source?: LeadSource;
  lifecycleStatus?: CustomerLifecycle;
  ownerId?: string; // 'pool' = Lead Pool (unassigned)
  companyId?: string;
  sortBy?: 'createdAt' | 'fullName' | 'lifecycleStatus';
  order?: 'asc' | 'desc';
}

export interface ListCustomersResponse {
  items: CustomerDto[];
  total: number;
  page: number;
  limit: number;
}

// Details carried by a 409 when create hits an existing customer (dedupe).
export interface CustomerDuplicateDetails {
  existingId: string;
  existingName: string;
  matchedField: 'email' | 'phone';
}

// Assignable owner (active employee) for the assign picker (Task 1.2).
export interface SalesOwnerDto {
  id: string;
  fullName: string;
  employeeCode: string;
}

export interface AssignOwnerRequest {
  ownerId: string | null; // null = back to Lead Pool
}

export interface BulkAssignRequest {
  customerIds: string[];
  ownerId: string | null;
}

export interface ChangeLifecycleRequest {
  lifecycleStatus: CustomerLifecycle;
  lostReason?: string; // required when lifecycleStatus = DISQUALIFIED
}

// ---- Company (B2B, Task 1.4) ----
export interface SalesCompanyDto {
  id: string;
  name: string;
  taxCode: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  address: string | null;
  customerCount: number;
  createdAt: string;
}

export interface CreateCompanyRequest {
  name: string;
  taxCode?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: string;
}

export type UpdateCompanyRequest = Partial<CreateCompanyRequest>;

export interface ListCompaniesResponse {
  items: SalesCompanyDto[];
  total: number;
  page: number;
  limit: number;
}

// ---- Pipeline / Stage / Deal (Phase 2) ----
export const SalesStageType = {
  NEW: 'NEW',
  QUALIFYING: 'QUALIFYING',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type SalesStageType = (typeof SalesStageType)[keyof typeof SalesStageType];

export const DealStatus = { OPEN: 'OPEN', WON: 'WON', LOST: 'LOST' } as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];

export interface SalesStageDto {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  type: SalesStageType;
  probability: number;
}

export interface SalesPipelineDto {
  id: string;
  name: string;
  isDefault: boolean;
  stages: SalesStageDto[];
}

export interface DealRef {
  id: string;
  fullName?: string;
  name?: string;
  type?: SalesStageType;
}

export interface DealDto {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; fullName: string } | null;
  pipelineId: string;
  currentStageId: string;
  stage: { id: string; name: string; type: SalesStageType } | null;
  ownerId: string;
  owner: { id: string; fullName: string } | null;
  amount: string;
  currency: string;
  status: DealStatus;
  expectedCloseDate: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
}

export interface CreateDealRequest {
  title: string;
  customerId: string;
  pipelineId: string;
  currentStageId?: string;
  ownerId?: string;
  currency?: string;
  expectedCloseDate?: string;
}

export interface UpdateDealRequest {
  title?: string;
  ownerId?: string;
  currency?: string;
  expectedCloseDate?: string | null;
}

export interface CreateStageRequest {
  name: string;
  type: SalesStageType;
  probability?: number;
}
export type UpdateStageRequest = Partial<CreateStageRequest>;

// ---- Product (Task 3.1) ----
export const ProductStatus = { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPrice: string;
  currency: string;
  unit: string | null;
  status: ProductStatus;
  createdAt: string;
}
export interface CreateProductRequest {
  name: string;
  sku?: string;
  description?: string;
  unitPrice?: number;
  currency?: string;
  unit?: string;
}
export type UpdateProductRequest = Partial<CreateProductRequest> & { status?: ProductStatus };
export interface ListProductsResponse {
  items: ProductDto[];
  total: number;
  page: number;
  limit: number;
}

// ---- Quote (Task 3.2) ----
export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export interface QuoteItemDto {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
}
export interface QuoteDto {
  id: string;
  dealId: string;
  code: string;
  status: QuoteStatus;
  isPrimary: boolean;
  validUntil: string | null;
  total: string;
  issuingEntityId: string | null;
  items: QuoteItemDto[];
  createdAt: string;
}
export interface QuoteItemInput {
  productId?: string | null;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
}
export interface CreateQuoteRequest {
  items: QuoteItemInput[];
  isPrimary?: boolean;
  status?: QuoteStatus;
  validUntil?: string | null;
  issuingEntityId?: string | null;
}
export type UpdateQuoteRequest = Partial<CreateQuoteRequest>;
