import type { Prisma, CustomerLifecycle } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import type { CustomerScope } from './customer.normalize.js';
import { buildCustomerScopeWhere } from './customer.normalize.js';

const listInclude = {
  owner: { select: { id: true, fullName: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.CustomerInclude;

export interface CustomerListFilters {
  search?: string;
  type?: Prisma.CustomerWhereInput['type'];
  source?: Prisma.CustomerWhereInput['source'];
  lifecycleStatus?: CustomerLifecycle;
  ownerId?: string; // 'pool' → Lead Pool (null); cuid → specific owner
  companyId?: string;
}

export interface CustomerListOptions {
  filters: CustomerListFilters;
  scope: CustomerScope;
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'fullName' | 'lifecycleStatus';
  order: 'asc' | 'desc';
}

function buildFilterWhere(tenantId: string, f: CustomerListFilters): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { tenantId };
  if (f.type) where.type = f.type;
  if (f.source) where.source = f.source;
  if (f.lifecycleStatus) where.lifecycleStatus = f.lifecycleStatus;
  if (f.companyId) where.companyId = f.companyId;
  if (f.ownerId) where.ownerId = f.ownerId === 'pool' ? null : f.ownerId;
  if (f.search) {
    where.OR = [
      { fullName: { contains: f.search, mode: 'insensitive' } },
      { email: { contains: f.search, mode: 'insensitive' } },
      { phone: { contains: f.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export const customerRepository = {
  async list(tenantId: string, opts: CustomerListOptions) {
    // Scope (owner visibility) AND filters AND tenant — combined so neither can be
    // bypassed by a search OR-clause.
    const where: Prisma.CustomerWhereInput = {
      AND: [buildFilterWhere(tenantId, opts.filters), buildCustomerScopeWhere(opts.scope)],
    };
    const [data, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: listInclude,
        orderBy: { [opts.sortBy]: opts.order },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      db.customer.count({ where }),
    ]);
    return { data, total };
  },

  async findById(tenantId: string, id: string) {
    return db.customer.findFirst({ where: { id, tenantId }, include: listInclude });
  },

  /** First existing customer matching email (case-insensitive) or normalized phone. */
  async findDuplicate(tenantId: string, email: string | null, phone: string | null) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
    if (phone) or.push({ phone });
    if (or.length === 0) return null;
    return db.customer.findFirst({
      where: { tenantId, OR: or },
      select: { id: true, fullName: true, email: true, phone: true },
    });
  },

  async create(data: Prisma.CustomerUncheckedCreateInput) {
    return db.customer.create({ data, include: listInclude });
  },

  async update(tenantId: string, id: string, data: Prisma.CustomerUncheckedUpdateInput) {
    // updateMany guards the tenant; then re-read with includes.
    const res = await db.customer.updateMany({ where: { id, tenantId }, data });
    if (res.count === 0) return null;
    return db.customer.findFirst({ where: { id, tenantId }, include: listInclude });
  },

  /**
   * Reassign owner (null = back to Lead Pool) and record an OWNER_CHANGED activity
   * in the same transaction. `assignedAt` tracks when it left the pool. A no-op
   * (same owner) updates nothing and writes no activity. Returns null if not found.
   */
  async changeOwner(
    tenantId: string,
    id: string,
    newOwnerId: string | null,
    actorEmployeeId: string | null,
  ) {
    return db.$transaction(async (tx) => {
      const current = await tx.customer.findFirst({ where: { id, tenantId }, select: { ownerId: true } });
      if (!current) return null;
      const oldOwnerId = current.ownerId;
      if (oldOwnerId === newOwnerId) {
        return tx.customer.findFirst({ where: { id, tenantId }, include: listInclude });
      }
      const nameOf = async (employeeId: string | null) =>
        employeeId
          ? (await tx.employee.findFirst({ where: { id: employeeId, tenantId }, select: { fullName: true } }))?.fullName ?? '?'
          : 'Lead Pool';
      const [fromName, toName] = await Promise.all([nameOf(oldOwnerId), nameOf(newOwnerId)]);

      await tx.customer.update({
        where: { id },
        data: { ownerId: newOwnerId, assignedAt: newOwnerId ? new Date() : null },
      });
      await tx.salesActivity.create({
        data: { tenantId, customerId: id, authorId: actorEmployeeId, type: 'OWNER_CHANGED', body: `${fromName} → ${toName}` },
      });
      return tx.customer.findFirst({ where: { id, tenantId }, include: listInclude });
    });
  },

  /**
   * Change lifecycle status (+ lostReason) and record a LIFECYCLE_CHANGED activity
   * in the same transaction. `lostReason` is only persisted for DISQUALIFIED — any
   * other status clears it. No-op (same status) writes nothing. Returns null if not found.
   */
  async changeLifecycle(
    tenantId: string,
    id: string,
    status: CustomerLifecycle,
    lostReason: string | null,
    actorEmployeeId: string | null,
  ) {
    return db.$transaction(async (tx) => {
      const current = await tx.customer.findFirst({ where: { id, tenantId }, select: { lifecycleStatus: true } });
      if (!current) return null;
      const from = current.lifecycleStatus;
      const nextLostReason = status === 'DISQUALIFIED' ? lostReason : null;
      if (from === status) {
        // Still allow updating the lost reason in place without an activity entry.
        await tx.customer.update({ where: { id }, data: { lostReason: nextLostReason } });
        return tx.customer.findFirst({ where: { id, tenantId }, include: listInclude });
      }
      await tx.customer.update({ where: { id }, data: { lifecycleStatus: status, lostReason: nextLostReason } });
      await tx.salesActivity.create({
        data: { tenantId, customerId: id, authorId: actorEmployeeId, type: 'LIFECYCLE_CHANGED', body: `${from} → ${status}` },
      });
      return tx.customer.findFirst({ where: { id, tenantId }, include: listInclude });
    });
  },

  /** Active employees as assignable owners (id + name + code) for the assign picker. */
  async listActiveEmployees(tenantId: string) {
    return db.employee.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, fullName: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    });
  },
};
