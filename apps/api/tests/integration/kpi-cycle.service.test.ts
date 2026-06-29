import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { kpiFrameworkService as fw } from '../../src/domain/services/kpi-framework.service.js';
import { kpiCycleService as cyc } from '../../src/domain/services/kpi-cycle.service.js';
import type { KpiFrameworkDto } from '@hrm/shared';

const SLUG = 'kpi-f2-test';
let tenantId: string;
let deptId: string;
let fwId: string;
let teamId: string;
let scA: string; // scorecard ids
let scB: string;
let D1 = '', D2 = '', Q1 = '';

async function makeEmployee(code: string, name: string, teamId: string | null): Promise<string> {
  const user = await db.user.create({
    data: { tenantId, email: `${code}@f2.test`, passwordHash: 'x', fullName: name, role: 'EMPLOYEE', status: 'ACTIVE' },
  });
  const emp = await db.employee.create({
    data: { tenantId, userId: user.id, employeeCode: code, fullName: name, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', departmentId: deptId, teamId },
  });
  return emp.id;
}

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
  const tenant = await db.tenant.create({ data: { name: 'KPI F2', slug: SLUG } });
  tenantId = tenant.id;
  deptId = (await db.department.create({ data: { tenantId, name: 'Eng' } })).id;

  // Framework: Delivery(60)[D1 INDIVIDUAL, D2 TEAM], Quality(40)[Q1 INDIVIDUAL]
  const created = await fw.create(tenantId, { name: 'F2 FW' });
  fwId = created.id;
  let dto: KpiFrameworkDto = await fw.addPillar(fwId, tenantId, { name: 'Delivery', weight: 60 });
  dto = await fw.addPillar(fwId, tenantId, { name: 'Quality', weight: 40 });
  const pDel = dto.pillars.find((p) => p.name === 'Delivery')!.id;
  const pQua = dto.pillars.find((p) => p.name === 'Quality')!.id;

  await fw.addDefinition(fwId, pDel, tenantId, { code: 'D1', name: 'Indiv metric', direction: 'HIGHER_BETTER', targetValue: 90, minValue: 75, weightInPillar: 50, scope: 'INDIVIDUAL', inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR' });
  await fw.addDefinition(fwId, pDel, tenantId, { code: 'D2', name: 'Team metric', direction: 'HIGHER_BETTER', targetValue: 90, minValue: 75, weightInPillar: 50, scope: 'TEAM', inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR' });
  dto = await fw.addDefinition(fwId, pQua, tenantId, { code: 'Q1', name: 'Quality metric', direction: 'HIGHER_BETTER', targetValue: 100, minValue: 80, weightInPillar: 100, scope: 'INDIVIDUAL', inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR' });
  const allDefs = dto.pillars.flatMap((p) => p.definitions);
  D1 = allDefs.find((d) => d.code === 'D1')!.id;
  D2 = allDefs.find((d) => d.code === 'D2')!.id;
  Q1 = allDefs.find((d) => d.code === 'Q1')!.id;

  for (const b of [
    { label: 'Chưa đạt', minScore: 0, maxScore: 39 },
    { label: 'Cần cải thiện', minScore: 40, maxScore: 59 },
    { label: 'Đạt yêu cầu', minScore: 60, maxScore: 74 },
    { label: 'Tốt', minScore: 75, maxScore: 89 },
    { label: 'Xuất sắc', minScore: 90, maxScore: 100 },
  ]) await fw.addBand(fwId, tenantId, b);

  await fw.setDepartments(fwId, tenantId, [deptId]);

  const team = await db.team.create({ data: { tenantId, departmentId: deptId, name: 'Squad A' } });
  teamId = team.id;
  await makeEmployee('A1', 'Alice', teamId);
  await makeEmployee('B1', 'Bob', teamId);
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
});

describe('KPI cycle — data entry → scoring → team fan-out', () => {
  it('creates a cycle with one scorecard per in-scope employee', async () => {
    const detail = await cyc.create(tenantId, { frameworkId: fwId, period: '2026-01', periodType: 'MONTHLY' }, null);
    expect(detail.scorecards).toHaveLength(2);
    expect(detail.teams).toHaveLength(1);
    expect(detail.teams[0].memberIds).toHaveLength(2);
    scA = detail.scorecards.find((s) => s.employeeName === 'Alice')!.id;
    scB = detail.scorecards.find((s) => s.employeeName === 'Bob')!.id;
  });

  it('blocks entry until cycle is in DATA_ENTRY', async () => {
    const detail = await cyc.getDetail((await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } })).id, tenantId);
    await expect(
      cyc.upsertEntries(detail.id, tenantId, [{ kpiDefinitionId: D1, scorecardId: scA, actualValue: 90 }], null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('scores individual + team KPIs and matches the hand calculation', async () => {
    const c = await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } });
    await cyc.transition(c.id, tenantId, 'DATA_ENTRY', null);

    const detail = await cyc.upsertEntries(c.id, tenantId, [
      { kpiDefinitionId: D2, teamId, actualValue: 75 }, // team → score 60, shared
      { kpiDefinitionId: D1, scorecardId: scA, actualValue: 90 }, // → 90
      { kpiDefinitionId: D1, scorecardId: scB, actualValue: 82.5 }, // → 75
      { kpiDefinitionId: Q1, scorecardId: scA, actualValue: 100 }, // → 90
      { kpiDefinitionId: Q1, scorecardId: scB, actualValue: 90 }, // → 75
    ], null);

    const a = detail.scorecards.find((s) => s.id === scA)!;
    const b = detail.scorecards.find((s) => s.id === scB)!;

    // Alice: Delivery=(90+60)/2=75, Quality=90 → (75*60+90*40)/100 = 81 → Tốt
    expect(a.weightedTotal).toBe(81);
    expect(a.ratingLabel).toBe('Tốt');
    // Bob: Delivery=(75+60)/2=67.5, Quality=75 → (67.5*60+75*40)/100 = 70.5 → Đạt yêu cầu
    expect(b.weightedTotal).toBe(70.5);
    expect(b.ratingLabel).toBe('Đạt yêu cầu');

    // Team fan-out: both members' Delivery pillar reflects the shared D2 score (60).
    const aDel = a.pillars.find((p) => p.pillarName === 'Delivery')!;
    const bDel = b.pillars.find((p) => p.pillarName === 'Delivery')!;
    expect(aDel.score).toBe(75);
    expect(bDel.score).toBe(67.5);
    // The team entry is shared, not duplicated per member.
    expect(detail.teamEntries.filter((e) => e.kpiDefinitionId === D2)).toHaveLength(1);
  });

  it('recomputes when an actual is edited', async () => {
    const c = await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } });
    const detail = await cyc.upsertEntries(c.id, tenantId, [
      { kpiDefinitionId: D2, teamId, actualValue: 90 }, // team now hits target → 90
    ], null);
    const a = detail.scorecards.find((s) => s.id === scA)!;
    // Alice Delivery now (90+90)/2=90, Quality 90 → (90*60+90*40)/100 = 90 → Xuất sắc
    expect(a.pillars.find((p) => p.pillarName === 'Delivery')!.score).toBe(90);
    expect(a.weightedTotal).toBe(90);
    expect(a.ratingLabel).toBe('Xuất sắc');
  });

  it('returns employee KPI history for the trend view', async () => {
    const c = await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } });
    const detail = await cyc.getDetail(c.id, tenantId);
    const aliceEmpId = detail.scorecards.find((s) => s.id === scA)!.employeeId;
    const history = await cyc.getEmployeeHistory(tenantId, aliceEmpId);
    expect(history.employeeName).toBe('Alice');
    expect(history.points).toHaveLength(1);
    expect(history.points[0].period).toBe('2026-01');
    expect(history.points[0].weightedTotal).toBe(90); // after the D2=90 edit
    expect(history.points[0].pillars.length).toBeGreaterThan(0);
  });

  it('rejects creating a cycle on an unbalanced framework', async () => {
    const bad = await fw.create(tenantId, { name: 'Unbalanced' });
    await fw.addPillar(bad.id, tenantId, { name: 'Only', weight: 50 }); // Σ=50 ≠ 100
    await expect(
      cyc.create(tenantId, { frameworkId: bad.id, period: '2026-02', periodType: 'MONTHLY' }, null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects an invalid status transition', async () => {
    const c = await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } });
    // currently DATA_ENTRY → cannot jump straight to FINALIZED
    await expect(cyc.transition(c.id, tenantId, 'FINALIZED', null)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('freezes scorecards after FINALIZED (no entry or profile edits)', async () => {
    const c = await db.kpiCycle.findFirstOrThrow({ where: { tenantId, frameworkId: fwId } });
    await cyc.transition(c.id, tenantId, 'PENDING_REVIEW', null);
    const finalized = await cyc.transition(c.id, tenantId, 'FINALIZED', null);
    expect(finalized.status).toBe('FINALIZED');

    await expect(
      cyc.upsertEntries(c.id, tenantId, [{ kpiDefinitionId: D1, scorecardId: scA, actualValue: 50 }], null),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      cyc.setScorecardProfile(scA, tenantId, null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
