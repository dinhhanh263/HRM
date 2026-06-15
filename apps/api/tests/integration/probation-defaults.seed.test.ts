import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import {
  DEFAULT_PROBATION_CRITERIA,
  seedProbationCriteriaForTenant,
} from '../../src/domain/probation/defaults.js';

const FRESH_TENANT_SLUG = 'probation-seed-fresh-tenant';
const LEGACY_TENANT_SLUG = 'probation-seed-legacy-tenant';

// SPEC-031: seed phải idempotent và tuyệt đối không đụng dữ liệu tiêu chí của
// tenant đã tồn tại (tenant SPEC-030 giữ nguyên bộ tiêu chí cũ của họ).

describe('seedProbationCriteriaForTenant (SPEC-031)', () => {
  let freshTenantId: string;
  let legacyTenantId: string;

  beforeAll(async () => {
    const fresh = await db.tenant.upsert({
      where: { slug: FRESH_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Seed Fresh', slug: FRESH_TENANT_SLUG },
    });
    freshTenantId = fresh.id;

    const legacy = await db.tenant.upsert({
      where: { slug: LEGACY_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Seed Legacy', slug: LEGACY_TENANT_SLUG },
    });
    legacyTenantId = legacy.id;

    await db.probationCriteria.deleteMany({
      where: { tenantId: { in: [freshTenantId, legacyTenantId] } },
    });
  });

  afterAll(async () => {
    await db.probationCriteria.deleteMany({
      where: { tenantId: { in: [freshTenantId, legacyTenantId] } },
    });
  });

  it('seeds the 6 competencies with group + rubric for a fresh tenant, idempotently', async () => {
    await seedProbationCriteriaForTenant(db, freshTenantId);
    // lần 2 không nhân đôi
    await seedProbationCriteriaForTenant(db, freshTenantId);

    const rows = await db.probationCriteria.findMany({
      where: { tenantId: freshTenantId },
      orderBy: { order: 'asc' },
    });

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.name)).toEqual(DEFAULT_PROBATION_CRITERIA.map((c) => c.name));
    expect(rows.map((r) => r.group)).toEqual(DEFAULT_PROBATION_CRITERIA.map((c) => c.group));
    for (const row of rows) {
      const rubric = row.rubric as Array<{ score: number; level: string }> | null;
      expect(rubric).toHaveLength(5);
      expect(rubric?.map((l) => l.score)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('leaves an existing tenant\'s criteria untouched', async () => {
    const custom = await db.probationCriteria.create({
      data: { tenantId: legacyTenantId, name: 'Tiêu chí cũ SPEC-030', order: 0 },
    });

    await seedProbationCriteriaForTenant(db, legacyTenantId);

    const rows = await db.probationCriteria.findMany({ where: { tenantId: legacyTenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(custom.id);
    expect(rows[0].name).toBe('Tiêu chí cũ SPEC-030');
    // cột mới nhận giá trị mặc định an toàn, rubric vẫn null
    expect(rows[0].group).toBe('PERFORMANCE');
    expect(rows[0].rubric).toBeNull();
  });
});
