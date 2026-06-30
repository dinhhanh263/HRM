import type { Customer, Employee, SalesCompany, Deal, SalesStage, Prisma } from '@prisma/client';

type CompanyWithCount = SalesCompany & { _count?: { customers: number } };

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

export function toCompanyDto(c: CompanyWithCount): SalesCompanyDto {
  return {
    id: c.id,
    name: c.name,
    taxCode: c.taxCode,
    industry: c.industry,
    size: c.size,
    website: c.website,
    address: c.address,
    customerCount: c._count?.customers ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

type CustomerWithRefs = Customer & {
  owner?: Pick<Employee, 'id' | 'fullName'> | null;
  company?: Pick<SalesCompany, 'id' | 'name'> | null;
};

export interface CustomerDto {
  id: string;
  type: Customer['type'];
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  source: Customer['source'];
  lifecycleStatus: Customer['lifecycleStatus'];
  lostReason: string | null;
  notes: string | null;
  ownerId: string | null;
  owner: { id: string; fullName: string } | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toCustomerDto(c: CustomerWithRefs): CustomerDto {
  return {
    id: c.id,
    type: c.type,
    fullName: c.fullName,
    title: c.title,
    email: c.email,
    phone: c.phone,
    address: c.address,
    source: c.source,
    lifecycleStatus: c.lifecycleStatus,
    lostReason: c.lostReason,
    notes: c.notes,
    ownerId: c.ownerId,
    owner: c.owner ? { id: c.owner.id, fullName: c.owner.fullName } : null,
    companyId: c.companyId,
    company: c.company ? { id: c.company.id, name: c.company.name } : null,
    assignedAt: c.assignedAt ? c.assignedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

type DealWithRefs = Deal & {
  customer?: Pick<Customer, 'id' | 'fullName'> | null;
  currentStage?: Pick<SalesStage, 'id' | 'name' | 'type'> | null;
  owner?: Pick<Employee, 'id' | 'fullName'> | null;
};

export interface DealDto {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; fullName: string } | null;
  pipelineId: string;
  currentStageId: string;
  stage: { id: string; name: string; type: SalesStage['type'] } | null;
  ownerId: string;
  owner: { id: string; fullName: string } | null;
  amount: string;
  currency: string;
  status: Deal['status'];
  expectedCloseDate: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
}

export function toDealDto(d: DealWithRefs): DealDto {
  return {
    id: d.id,
    title: d.title,
    customerId: d.customerId,
    customer: d.customer ? { id: d.customer.id, fullName: d.customer.fullName } : null,
    pipelineId: d.pipelineId,
    currentStageId: d.currentStageId,
    stage: d.currentStage ? { id: d.currentStage.id, name: d.currentStage.name, type: d.currentStage.type } : null,
    ownerId: d.ownerId,
    owner: d.owner ? { id: d.owner.id, fullName: d.owner.fullName } : null,
    amount: (d.amount as Prisma.Decimal).toString(),
    currency: d.currency,
    status: d.status,
    expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.toISOString() : null,
    wonAt: d.wonAt ? d.wonAt.toISOString() : null,
    lostAt: d.lostAt ? d.lostAt.toISOString() : null,
    lostReason: d.lostReason,
    createdAt: d.createdAt.toISOString(),
  };
}

type ProductRow = import('@prisma/client').Product;

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPrice: string;
  currency: string;
  unit: string | null;
  status: ProductRow['status'];
  createdAt: string;
}

export function toProductDto(p: ProductRow): ProductDto {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    unitPrice: (p.unitPrice as unknown as { toString(): string }).toString(),
    currency: p.currency,
    unit: p.unit,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

type QuoteRow = import('@prisma/client').Quote & {
  items?: (import('@prisma/client').QuoteItem & { product?: { id: string; name: string } | null })[];
};

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
  status: QuoteRow['status'];
  isPrimary: boolean;
  validUntil: string | null;
  total: string;
  issuingEntityId: string | null;
  items: QuoteItemDto[];
  createdAt: string;
}

const dec = (v: unknown) => (v as { toString(): string }).toString();

export function toQuoteDto(q: QuoteRow): QuoteDto {
  return {
    id: q.id,
    dealId: q.dealId,
    code: q.code,
    status: q.status,
    isPrimary: q.isPrimary,
    validUntil: q.validUntil ? q.validUntil.toISOString() : null,
    total: dec(q.total),
    issuingEntityId: q.issuingEntityId,
    items: (q.items ?? []).map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product?.name ?? null,
      description: it.description,
      quantity: dec(it.quantity),
      unitPrice: dec(it.unitPrice),
      discountPct: dec(it.discountPct),
      lineTotal: dec(it.lineTotal),
    })),
    createdAt: q.createdAt.toISOString(),
  };
}
