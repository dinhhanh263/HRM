import type { CustomerLifecycle } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersInput,
} from '../../app/validators/sales-customer.validator.js';
import type { CustomerScope } from './customer.normalize.js';
import { normalizePhone } from './customer.normalize.js';
import type { ParsedImportRow } from './customer-import.js';
import { customerRepository } from './customer.repository.js';
import { companyRepository } from './company.repository.js';
import { toCustomerDto } from './mappers.js';

/** Guard a companyId belongs to the tenant (cross-tenant link protection). */
async function assertCompanyInTenant(tenantId: string, companyId: string | null | undefined) {
  if (!companyId) return;
  const company = await companyRepository.findById(tenantId, companyId);
  if (!company) throw new BadRequestError('Công ty không hợp lệ');
}

/** Empty string → null; trims falsy to a clean nullable column value. */
function nullable(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export const customerService = {
  async list(tenantId: string, scope: CustomerScope, input: ListCustomersInput) {
    const { data, total } = await customerRepository.list(tenantId, {
      scope,
      page: input.page,
      limit: input.limit,
      sortBy: input.sortBy,
      order: input.order,
      filters: {
        search: input.search,
        type: input.type,
        source: input.source,
        lifecycleStatus: input.lifecycleStatus as never,
        ownerId: input.ownerId,
        companyId: input.companyId,
      },
    });
    return { items: data.map(toCustomerDto), total, page: input.page, limit: input.limit };
  },

  async get(tenantId: string, id: string) {
    const row = await customerRepository.findById(tenantId, id);
    if (!row) throw new NotFoundError('Không tìm thấy khách hàng');
    return toCustomerDto(row);
  },

  /**
   * Create a customer. Phone is normalized to E.164, then we dedupe on email
   * (case-insensitive) / phone before insert — a hit is a 409 carrying the existing
   * record so the UI can offer "open / merge". A new lead created by a rep is owned
   * by that rep; an admin without an Employee profile leaves it in the Lead Pool.
   */
  async create(tenantId: string, actorEmployeeId: string | null, input: CreateCustomerInput) {
    const email = nullable(input.email);
    const phone = normalizePhone(input.phone);
    await assertCompanyInTenant(tenantId, input.companyId);

    const dup = await customerRepository.findDuplicate(tenantId, email, phone);
    if (dup) {
      const field = dup.email && email && dup.email.toLowerCase() === email.toLowerCase() ? 'email' : 'phone';
      throw new ConflictError('Khách hàng đã tồn tại', 'CUSTOMER_DUPLICATE', {
        existingId: dup.id,
        existingName: dup.fullName,
        matchedField: field,
      });
    }

    const created = await customerRepository.create({
      tenantId,
      type: input.type,
      fullName: input.fullName.trim(),
      title: nullable(input.title),
      email,
      phone,
      address: nullable(input.address),
      source: input.source, // undefined → DB default OTHER
      notes: nullable(input.notes),
      companyId: input.companyId ?? null,
      ownerId: actorEmployeeId,
      assignedAt: actorEmployeeId ? new Date() : null,
    });
    return toCustomerDto(created);
  },

  async update(tenantId: string, id: string, input: UpdateCustomerInput) {
    if (input.companyId !== undefined) await assertCompanyInTenant(tenantId, input.companyId);
    const data: Record<string, unknown> = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.title !== undefined) data.title = nullable(input.title);
    if (input.email !== undefined) data.email = nullable(input.email);
    if (input.phone !== undefined) data.phone = normalizePhone(input.phone);
    if (input.address !== undefined) data.address = nullable(input.address);
    if (input.source !== undefined) data.source = input.source;
    if (input.notes !== undefined) data.notes = nullable(input.notes);
    if (input.companyId !== undefined) data.companyId = input.companyId ?? null;

    const updated = await customerRepository.update(tenantId, id, data);
    if (!updated) throw new NotFoundError('Không tìm thấy khách hàng');
    return toCustomerDto(updated);
  },

  /** Assignable owners (active employees) for the assign picker. */
  async listOwners(tenantId: string) {
    return customerRepository.listActiveEmployees(tenantId);
  },

  /** Assign/reassign a customer to a specific owner, or null = back to Lead Pool. */
  async assign(tenantId: string, id: string, newOwnerId: string | null, actorEmployeeId: string | null) {
    if (newOwnerId) {
      const emp = await employeeRepository.findById(newOwnerId, tenantId);
      if (!emp) throw new BadRequestError('Người phụ trách không hợp lệ');
    }
    const updated = await customerRepository.changeOwner(tenantId, id, newOwnerId, actorEmployeeId);
    if (!updated) throw new NotFoundError('Không tìm thấy khách hàng');
    return toCustomerDto(updated);
  },

  /** A rep takes an unassigned Lead Pool record. Blocked if already owned by someone else. */
  async claim(tenantId: string, id: string, actorEmployeeId: string | null) {
    if (!actorEmployeeId) throw new BadRequestError('Tài khoản của bạn chưa gắn hồ sơ nhân viên');
    const existing = await customerRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError('Không tìm thấy khách hàng');
    if (existing.ownerId && existing.ownerId !== actorEmployeeId) {
      throw new ConflictError('Khách hàng đã có người phụ trách', 'CUSTOMER_ALREADY_OWNED');
    }
    const updated = await customerRepository.changeOwner(tenantId, id, actorEmployeeId, actorEmployeeId);
    return toCustomerDto(updated!);
  },

  /**
   * Import parsed rows into the Lead Pool (ownerId null). `commit=false` is a dry-run
   * (validate + dedupe, create nothing) so the UI can preview. Dedupe runs both within
   * the file and against existing customers; rejected rows come back with a reason.
   */
  async importCustomers(tenantId: string, rows: ParsedImportRow[], commit: boolean) {
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const skipped: { rowNumber: number; fullName: string; reason: string }[] = [];
    let valid = 0;
    let created = 0;

    for (const row of rows) {
      const skip = (reason: string) => skipped.push({ rowNumber: row.rowNumber, fullName: row.fullName, reason });
      if (row.error) { skip(row.error); continue; }

      const email = row.email ? row.email.toLowerCase() : null;
      const phone = normalizePhone(row.phone);
      if (email && seenEmail.has(email)) { skip('Trùng email trong file'); continue; }
      if (phone && seenPhone.has(phone)) { skip('Trùng SĐT trong file'); continue; }

      const dup = await customerRepository.findDuplicate(tenantId, row.email, phone);
      if (dup) { skip('Khách hàng đã tồn tại'); continue; }

      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);
      valid += 1;

      if (commit) {
        await customerRepository.create({
          tenantId,
          type: row.type,
          fullName: row.fullName.trim(),
          email: row.email,
          phone,
          title: row.title,
          address: row.address,
          source: row.source ?? 'IMPORT',
          ownerId: null, // Lead Pool
          assignedAt: null,
        });
        created += 1;
      }
    }
    return { total: rows.length, valid, created, skipped };
  },

  /** Change lifecycle status; DISQUALIFIED carries a lostReason (enforced by the validator). */
  async changeLifecycle(
    tenantId: string,
    id: string,
    status: CustomerLifecycle,
    lostReason: string | undefined,
    actorEmployeeId: string | null,
  ) {
    const updated = await customerRepository.changeLifecycle(tenantId, id, status, lostReason ?? null, actorEmployeeId);
    if (!updated) throw new NotFoundError('Không tìm thấy khách hàng');
    return toCustomerDto(updated);
  },

  /** Bulk (re)assign many customers to one owner (or Lead Pool). Returns affected count. */
  async bulkAssign(tenantId: string, ids: string[], newOwnerId: string | null, actorEmployeeId: string | null) {
    if (newOwnerId) {
      const emp = await employeeRepository.findById(newOwnerId, tenantId);
      if (!emp) throw new BadRequestError('Người phụ trách không hợp lệ');
    }
    let count = 0;
    for (const id of ids) {
      const res = await customerRepository.changeOwner(tenantId, id, newOwnerId, actorEmployeeId);
      if (res) count += 1;
    }
    return { count };
  },
};
