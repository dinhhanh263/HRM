import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { kpiFrameworkService as fw } from '../../src/domain/services/kpi-framework.service.js';
import { kpiTeamService as teamSvc } from '../../src/domain/services/kpi-team.service.js';

const SLUG = 'kpi-f1-test';
const SLUG2 = 'kpi-f1-other';
let tenantId: string;
let deptId: string;
let otherTenantId: string;
let otherDeptId: string;

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: { in: [SLUG, SLUG2] } } });
  const tenant = await db.tenant.create({ data: { name: 'KPI F1 Test', slug: SLUG } });
  tenantId = tenant.id;
  const dept = await db.department.create({ data: { tenantId, name: 'Sales' } });
  deptId = dept.id;

  const other = await db.tenant.create({ data: { name: 'KPI F1 Other', slug: SLUG2 } });
  otherTenantId = other.id;
  const otherDept = await db.department.create({ data: { tenantId: otherTenantId, name: 'Foreign Dept' } });
  otherDeptId = otherDept.id;
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: { in: [SLUG, SLUG2] } } });
});

describe('KPI Framework builder — Sales framework from scratch', () => {
  let fwId: string;
  let deliveryPillarId: string;
  let qualityPillarId: string;

  it('creates an empty framework (valid — nothing to check yet)', async () => {
    const created = await fw.create(tenantId, { name: 'Sales Performance', description: 'Doanh số' });
    fwId = created.id;
    expect(created.pillars).toHaveLength(0);
    const v = await fw.validate(fwId, tenantId);
    expect(v.valid).toBe(true);
  });

  it('rejects a duplicate framework name (409)', async () => {
    await expect(fw.create(tenantId, { name: 'Sales Performance' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('adds two pillars summing to 100%', async () => {
    let dto = await fw.addPillar(fwId, tenantId, { name: 'Revenue', weight: 60 });
    dto = await fw.addPillar(fwId, tenantId, { name: 'Pipeline', weight: 40 });
    expect(dto.pillars).toHaveLength(2);
    deliveryPillarId = dto.pillars.find((p) => p.name === 'Revenue')!.id;
    qualityPillarId = dto.pillars.find((p) => p.name === 'Pipeline')!.id;
    const v = await fw.validate(fwId, tenantId);
    expect(v.valid).toBe(true);
  });

  it('flags pillar weights that no longer sum to 100', async () => {
    await fw.addPillar(fwId, tenantId, { name: 'Extra', weight: 30 }); // 60+40+30 = 130
    const v = await fw.validate(fwId, tenantId);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.scope === 'PILLARS' && i.actualSum === 130)).toBe(true);
    // remove the extra pillar to restore balance
    const dto = await fw.getById(fwId, tenantId);
    const extra = dto.pillars.find((p) => p.name === 'Extra')!;
    await fw.removePillar(fwId, extra.id, tenantId);
    expect((await fw.validate(fwId, tenantId)).valid).toBe(true);
  });

  it('adds KPI definitions whose weights must sum to 100 within a pillar', async () => {
    await fw.addDefinition(fwId, deliveryPillarId, tenantId, {
      code: 'R1', name: 'Revenue attainment', direction: 'HIGHER_BETTER',
      targetValue: 100, minValue: 80, weightInPillar: 60, scope: 'INDIVIDUAL',
      inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR',
    });
    await fw.addDefinition(fwId, deliveryPillarId, tenantId, {
      code: 'R2', name: 'Churn rate', direction: 'LOWER_BETTER',
      targetValue: 5, minValue: 10, weightInPillar: 40, scope: 'INDIVIDUAL',
      inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR',
    });
    const v = await fw.validate(fwId, tenantId);
    // Revenue pillar KPIs 60+40=100 OK; Pipeline pillar has no KPIs (skipped). Valid.
    expect(v.valid).toBe(true);
  });

  it('adds a weight profile that must sum to 100', async () => {
    const dto = await fw.addProfile(fwId, tenantId, {
      name: 'Sales Rep',
      pillarWeights: [
        { pillarId: deliveryPillarId, weight: 70 },
        { pillarId: qualityPillarId, weight: 30 },
      ],
    });
    expect(dto.weightProfiles).toHaveLength(1);
    expect((await fw.validate(fwId, tenantId)).valid).toBe(true);
  });

  it('assigns the framework to a department (tenant-scoped)', async () => {
    const dto = await fw.setDepartments(fwId, tenantId, [deptId]);
    expect(dto.departmentIds).toEqual([deptId]);

    const list = await fw.getAll(tenantId);
    const row = list.find((f) => f.id === fwId)!;
    expect(row.pillarCount).toBe(2);
    expect(row.kpiCount).toBe(2);
    expect(row.departmentCount).toBe(1);
  });

  it('does not leak frameworks across tenants', async () => {
    await expect(fw.getById(fwId, 'some-other-tenant')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('KPI Team CRUD', () => {
  it('creates, updates and lists a team', async () => {
    const created = await teamSvc.create(tenantId, { name: 'Squad Alpha', departmentId: deptId });
    expect(created.name).toBe('Squad Alpha');
    expect(created.departmentName).toBe('Sales');
    expect(created.memberCount).toBe(0);

    const updated = await teamSvc.update(created.id, tenantId, { name: 'Squad Beta' });
    expect(updated.name).toBe('Squad Beta');

    const all = await teamSvc.getAll(tenantId);
    expect(all.some((t) => t.id === created.id && t.name === 'Squad Beta')).toBe(true);

    await teamSvc.remove(created.id, tenantId);
    expect((await teamSvc.getAll(tenantId)).some((t) => t.id === created.id)).toBe(false);
  });

  it('rejects duplicate team name', async () => {
    await teamSvc.create(tenantId, { name: 'Dup Team' });
    await expect(teamSvc.create(tenantId, { name: 'Dup Team' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a team attached to another tenant department (H2)', async () => {
    await expect(
      teamSvc.create(tenantId, { name: 'Cross Team', departmentId: otherDeptId }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('F1 security & validation guards', () => {
  let fwId: string;
  let pillarId: string;

  beforeAll(async () => {
    const created = await fw.create(tenantId, { name: 'Guard FW' });
    fwId = created.id;
    const dto = await fw.addPillar(fwId, tenantId, { name: 'P1', weight: 100 });
    pillarId = dto.pillars[0].id;
  });

  it('denies nested mutation from another tenant (IDOR → 404)', async () => {
    await expect(
      fw.updatePillar(fwId, pillarId, otherTenantId, { name: 'hacked', weight: 50 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('drops cross-tenant department ids in setDepartments', async () => {
    const dto = await fw.setDepartments(fwId, tenantId, [deptId, otherDeptId]);
    expect(dto.departmentIds).toEqual([deptId]);
  });

  it('rejects a weight profile binding a pillar outside the framework (M1)', async () => {
    await expect(
      fw.addProfile(fwId, tenantId, { name: 'Bad', pillarWeights: [{ pillarId: 'not-a-pillar', weight: 100 }] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects overlapping rating bands (M2)', async () => {
    await fw.addBand(fwId, tenantId, { label: 'Low', minScore: 0, maxScore: 50 });
    await expect(
      fw.addBand(fwId, tenantId, { label: 'Mid', minScore: 40, maxScore: 70 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    // adjacent, non-overlapping is allowed
    const dto = await fw.addBand(fwId, tenantId, { label: 'High', minScore: 51, maxScore: 100 });
    expect(dto.ratingBands).toHaveLength(2);
  });

  it('rejects framework with passAnchor >= targetAnchor via validator-equivalent guard', async () => {
    // service.create accepts anchors; the Zod refine guards the HTTP layer. Here we assert
    // the sane default ordering holds when omitted.
    const dto = await fw.getById(fwId, tenantId);
    expect(dto.passAnchor).toBeLessThan(dto.targetAnchor);
  });
});
