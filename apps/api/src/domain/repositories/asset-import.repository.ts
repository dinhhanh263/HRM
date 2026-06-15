import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Batch lookups for the dry-run validator plus the two creators used by the
 * atomic import. The lookups are read-only, single tenant-scoped `IN (...)`
 * queries so validating 2,000 rows costs a handful of queries rather than
 * thousands. The creators run inside the import's single `$transaction`.
 */
export const assetImportRepository = {
  /** Asset codes (as stored) that already exist in this tenant. */
  async existingAssetCodes(tenantId: string, codes: string[]): Promise<Set<string>> {
    if (codes.length === 0) return new Set();
    const rows = await db.asset.findMany({
      where: { tenantId, assetCode: { in: codes } },
      select: { assetCode: true },
    });
    return new Set(rows.map((r) => r.assetCode));
  },

  /** Map existing category codes → id for this tenant. */
  async categoryIdsByCode(tenantId: string, codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await db.assetCategory.findMany({
      where: { tenantId, code: { in: codes } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.code, r.id]));
  },

  /**
   * Resolve owner references to ACTIVE employee ids in one query. An owner cell
   * may hold either the employee's login email or their employee code, so we
   * match on both. Keys the result by BOTH employee code (as stored) and
   * lowercased login email so the caller can look up by whichever form was used.
   * Only ACTIVE employees can receive an assignment.
   */
  async resolveOwnerIds(tenantId: string, refs: string[]): Promise<Map<string, string>> {
    if (refs.length === 0) return new Map();
    const lowered = refs.map((r) => r.toLowerCase());
    const rows = await db.employee.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [{ employeeCode: { in: refs } }, { user: { email: { in: lowered } } }],
      },
      select: { id: true, employeeCode: true, user: { select: { email: true } } },
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.employeeCode) map.set(r.employeeCode, r.id);
      if (r.user?.email) map.set(r.user.email.toLowerCase(), r.id);
    }
    return map;
  },

  /** Create one asset inside the import transaction; returns the new id. */
  async createAsset(tx: Tx, data: Prisma.AssetUncheckedCreateInput): Promise<string> {
    const asset = await tx.asset.create({ data, select: { id: true } });
    return asset.id;
  },

  /** Create one ACTIVE handover for an owner row inside the import transaction. */
  async createAssignment(tx: Tx, data: Prisma.AssetAssignmentUncheckedCreateInput): Promise<void> {
    await tx.assetAssignment.create({ data });
  },
};
