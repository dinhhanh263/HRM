import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

// SPEC-043: data access for issuing entities. Tenant-scoped everywhere; the
// "only one isDefault per tenant" invariant is enforced in transactional helpers
// (createEntity / updateEntity) that unset other defaults atomically.
export const issuingEntityRepository = {
  /** All entities for the tenant, newest default first then by name. `activeOnly`
   *  restricts to active rows (the PR dropdown); management lists everything. */
  async findAll(tenantId: string, activeOnly = false) {
    return db.issuingEntity.findMany({
      where: { tenantId, ...(activeOnly && { active: true }) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.issuingEntity.findFirst({ where: { id, tenantId } });
  },

  /**
   * Create an entity. When `isDefault` is true, unset every other default for the
   * tenant inside the same transaction so at most one default ever exists.
   */
  async createEntity(tenantId: string, data: Prisma.IssuingEntityUncheckedCreateInput) {
    return db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.issuingEntity.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.issuingEntity.create({ data });
    });
  },

  /**
   * Update an entity. When the patch sets `isDefault=true`, unset the other
   * defaults for the tenant in the same transaction.
   */
  async updateEntity(
    id: string,
    tenantId: string,
    data: Prisma.IssuingEntityUncheckedUpdateInput,
  ) {
    return db.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.issuingEntity.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      // Tenant-scoped write (defense-in-depth, matches setLogoUrl) so a future
      // caller can't update another tenant's row even if it skips the findById guard.
      await tx.issuingEntity.update({ where: { id, tenantId }, data });
      return tx.issuingEntity.findFirstOrThrow({ where: { id, tenantId } });
    });
  },

  /** Set logoUrl directly (upload / clear). */
  async setLogoUrl(id: string, tenantId: string, logoUrl: string | null) {
    return db.issuingEntity.update({ where: { id, tenantId }, data: { logoUrl } });
  },
};
