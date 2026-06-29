import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { kpiFrameworkService as fw } from '../../src/domain/services/kpi-framework.service.js';
import { kpiCycleService as cyc } from '../../src/domain/services/kpi-cycle.service.js';
import { kpiSurveyService as survey } from '../../src/domain/services/kpi-survey.service.js';

const SLUG = 'kpi-survey-test';
let tenantId: string;
let deptId: string;
let frameworkId: string;
let surveyId: string;
let cycleId: string;
let teamId: string;

async function makeEmp(code: string, teamId: string) {
  const user = await db.user.create({ data: { tenantId, email: `${code}@sv.test`, passwordHash: 'x', fullName: code, role: 'EMPLOYEE', status: 'ACTIVE' } });
  await db.employee.create({ data: { tenantId, userId: user.id, employeeCode: code, fullName: code, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', departmentId: deptId, teamId } });
}

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
  tenantId = (await db.tenant.create({ data: { name: 'KPI Survey', slug: SLUG } })).id;
  deptId = (await db.department.create({ data: { tenantId, name: 'Eng' } })).id;

  // Framework: 1 pillar Health(100) với 1 KPI T1 (SURVEY, TEAM, target 7.5 / min 6.0).
  const f = await fw.create(tenantId, { name: 'Health FW' });
  frameworkId = f.id;
  const dto = await fw.addPillar(f.id, tenantId, { name: 'Health', weight: 100 });
  const pillarId = dto.pillars[0].id;
  await fw.addDefinition(f.id, pillarId, tenantId, {
    code: 'T1', name: 'Morale', direction: 'HIGHER_BETTER', targetValue: 7.5, minValue: 6.0,
    weightInPillar: 100, scope: 'TEAM', inputType: 'SURVEY', scoringMethod: 'THRESHOLD_LINEAR', surveyKpiCode: 'T1',
  });
  await fw.addBand(f.id, tenantId, { label: 'Tốt', minScore: 75, maxScore: 100 });
  await fw.addBand(f.id, tenantId, { label: 'Đạt', minScore: 0, maxScore: 74 });
  await fw.setDepartments(f.id, tenantId, [deptId]);

  // Survey morale (minResponses 3) với câu M1 → T1.
  const s = await survey.create(tenantId, { frameworkId, type: 'MONTHLY_MORALE', title: 'Morale tháng', minResponses: 3 });
  surveyId = s.id;
  await survey.addQuestion(surveyId, tenantId, { code: 'M1', text: 'Bạn hài lòng mức nào?', scaleMin: 1, scaleMax: 10, mapsToKpiCode: 'T1' });

  const team = await db.team.create({ data: { tenantId, departmentId: deptId, name: 'Squad' } });
  teamId = team.id;
  await makeEmp('A1', teamId);
  await makeEmp('B1', teamId);

  const created = await cyc.create(tenantId, { frameworkId, period: '2026-06', periodType: 'MONTHLY' }, null);
  cycleId = created.id;
  await cyc.transition(cycleId, tenantId, 'DATA_ENTRY', null);
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
});

describe('KPI survey — anonymous responses + threshold + aggregate', () => {
  it('stores responses without any respondent identity', async () => {
    await survey.respond(surveyId, tenantId, 'user-1', { cycleId, answers: { M1: 7 } });
    await survey.respond(surveyId, tenantId, 'user-2', { cycleId, answers: { M1: 7 } });
    const rows = await db.kpiSurveyResponse.findMany({ where: { surveyId } });
    expect(rows).toHaveLength(2);
    // Anonymity: response KHÔNG có cột định danh người trả lời (answers tách khỏi userId).
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain('raterId');
      expect(Object.keys(r)).not.toContain('userId');
      expect(r.subjectEmployeeId).toBeNull();
    }
  });

  it('blocks the same person responding twice (ballot-stuffing)', async () => {
    await expect(survey.respond(surveyId, tenantId, 'user-1', { cycleId, answers: { M1: 8 } }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('does NOT aggregate below the minResponses threshold', async () => {
    const result = await cyc.aggregateSurveys(cycleId, tenantId); // only 2 responses, min 3
    expect(result.aggregated).toHaveLength(0);
    expect(result.skipped.some((s) => s.reason === 'below_min_responses')).toBe(true);
    const entries = await db.kpiEntry.count({ where: { cycleId, teamId: { not: null } } });
    expect(entries).toBe(0);
  });

  it('aggregates into a team entry once the threshold is met and scores it', async () => {
    await survey.respond(surveyId, tenantId, 'user-3', { cycleId, answers: { M1: 7 } }); // now 3 responses, avg 7
    const result = await cyc.aggregateSurveys(cycleId, tenantId);
    expect(result.aggregated).toHaveLength(1);
    expect(result.aggregated[0].kpiCode).toBe('T1');
    expect(result.aggregated[0].value).toBe(7);
    expect(result.aggregated[0].teamsApplied).toBe(1);

    // Team entry written for the squad; both members' scorecards reflect the score.
    const detail = await cyc.getDetail(cycleId, tenantId);
    expect(detail.teamEntries.some((e) => e.teamId === teamId)).toBe(true);
    // T1 avg 7 → score 60 + (7-6)*((90-60)/(7.5-6)) = 60 + 20 = 80
    for (const sc of detail.scorecards) {
      expect(sc.weightedTotal).toBe(80);
    }
  });

  it('rejects an answer outside the question scale', async () => {
    await expect(survey.respond(surveyId, tenantId, 'user-9', { cycleId, answers: { M1: 99 } })).rejects.toMatchObject({ statusCode: 422 });
  });
});
