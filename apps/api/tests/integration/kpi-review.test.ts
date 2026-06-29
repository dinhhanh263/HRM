import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import { kpiFrameworkService as fw } from '../../src/domain/services/kpi-framework.service.js';
import { kpiCycleService as cyc } from '../../src/domain/services/kpi-cycle.service.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultKpiReviewFlowForTenant } from '../../src/domain/kpi/defaults.js';
import type { ApprovalActor } from '../../src/domain/leave/approval-routing.helper.js';

const SLUG = 'kpi-review-test';
let tenantId: string;
let deptId: string;
let mgrEmpId: string;
let reportEmpId: string;
let hrEmpId: string;
let kpiDefId: string;

async function makeEmp(email: string, roleEnum: string, departmentId: string | null, managerId: string | null) {
  const user = await db.user.create({
    data: { tenantId, email, passwordHash: 'x', fullName: email, role: roleEnum as never, status: 'ACTIVE' },
  });
  const emp = await db.employee.create({
    data: { tenantId, userId: user.id, employeeCode: email, fullName: email, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', departmentId, managerId },
  });
  return emp.id;
}

const mgrActor = (): ApprovalActor => ({ employeeId: mgrEmpId, roleKey: 'manager', isSuperAdmin: false });
const hrActor = (): ApprovalActor => ({ employeeId: hrEmpId, roleKey: 'hr_manager', isSuperAdmin: false });

async function buildBalancedFramework(name: string, deptIds: string[]): Promise<{ frameworkId: string; defId: string }> {
  const f = await fw.create(tenantId, { name });
  const dto = await fw.addPillar(f.id, tenantId, { name: 'P', weight: 100 });
  const pillarId = dto.pillars[0].id;
  const withDef = await fw.addDefinition(f.id, pillarId, tenantId, {
    code: 'K1', name: 'Metric', direction: 'HIGHER_BETTER', targetValue: 90, minValue: 70,
    weightInPillar: 100, scope: 'INDIVIDUAL', inputType: 'MANUAL', scoringMethod: 'THRESHOLD_LINEAR',
  });
  await fw.addBand(f.id, tenantId, { label: 'Tốt', minScore: 75, maxScore: 100 });
  await fw.addBand(f.id, tenantId, { label: 'Đạt', minScore: 0, maxScore: 74 });
  await fw.setDepartments(f.id, tenantId, deptIds);
  return { frameworkId: f.id, defId: withDef.pillars[0].definitions[0].id };
}

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
  tenantId = (await db.tenant.create({ data: { name: 'KPI Review', slug: SLUG } })).id;
  await seedPermissionCatalog(db);
  await syncSystemRolesForTenant(db, tenantId);
  await seedDefaultKpiReviewFlowForTenant(db, tenantId);
  deptId = (await db.department.create({ data: { tenantId, name: 'Eng' } })).id;
  mgrEmpId = await makeEmp('mgr@rev.test', 'MANAGER', null, null);
  reportEmpId = await makeEmp('rep@rev.test', 'EMPLOYEE', deptId, mgrEmpId);
  hrEmpId = await makeEmp('hr@rev.test', 'HR_MANAGER', null, null);
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
});

describe('KPI review lifecycle: self-assess → manager → HR → finalized', () => {
  let cycleId: string;
  let scId: string;

  it('runs self-assessment then opens review with a Manager→HR snapshot', async () => {
    const { frameworkId, defId } = await buildBalancedFramework('Rev FW', [deptId]);
    kpiDefId = defId;
    const created = await cyc.create(tenantId, { frameworkId, period: '2026-03', periodType: 'MONTHLY' }, null);
    cycleId = created.id;
    scId = created.scorecards[0].id;
    expect(created.scorecards).toHaveLength(1); // only the report is in dept

    await cyc.transition(cycleId, tenantId, 'DATA_ENTRY', null);
    await cyc.upsertEntries(cycleId, tenantId, [{ kpiDefinitionId: kpiDefId, scorecardId: scId, actualValue: 90 }], null);
    await cyc.transition(cycleId, tenantId, 'SELF_ASSESSMENT', null);

    // ownership: another employee cannot self-assess this scorecard
    await expect(cyc.selfAssess(scId, tenantId, mgrEmpId, { selfComment: 'x' })).rejects.toMatchObject({ statusCode: 403 });

    const afterSelf = await cyc.selfAssess(scId, tenantId, reportEmpId, { selfComment: 'Tôi đã hoàn thành tốt' });
    expect(afterSelf.scorecards[0].status).toBe('SELF_ASSESSED');
    expect(afterSelf.scorecards[0].selfComment).toBe('Tôi đã hoàn thành tốt');

    const inReview = await cyc.transition(cycleId, tenantId, 'PENDING_REVIEW', null);
    const sc = inReview.scorecards[0];
    expect(sc.status).toBe('IN_REVIEW');
    expect(sc.currentStep).toBe(1);
    expect(sc.approvals).toHaveLength(2); // Manager + HR(role)
  });

  it('rejects a non-current approver', async () => {
    // HR is step 2; cannot act while Manager step is current
    await expect(
      cyc.reviewScorecard(scId, tenantId, hrActor(), { decision: 'APPROVED' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('manager approves (with notes) then HR approves → FINALIZED', async () => {
    const afterMgr = await cyc.reviewScorecard(scId, tenantId, mgrActor(), {
      decision: 'APPROVED', strengths: 'Giao hàng đúng hạn', actionPlan: 'Học thêm system design',
    });
    const sc1 = afterMgr.scorecards[0];
    expect(sc1.currentStep).toBe(2);
    expect(sc1.status).toBe('IN_REVIEW');
    expect(sc1.strengths).toBe('Giao hàng đúng hạn');

    const afterHr = await cyc.reviewScorecard(scId, tenantId, hrActor(), { decision: 'APPROVED' });
    const sc2 = afterHr.scorecards[0];
    expect(sc2.status).toBe('FINALIZED');
    expect(sc2.approvals.filter((a) => a.decision === 'APPROVED')).toHaveLength(2);
  });

  it('return → resubmit creates a fresh round', async () => {
    // New cycle to test the RETURNED path
    const { frameworkId } = await buildBalancedFramework('Rev FW 2', [deptId]);
    const c = await cyc.create(tenantId, { frameworkId, period: '2026-04', periodType: 'MONTHLY' }, null);
    const sid = c.scorecards[0].id;
    await cyc.transition(c.id, tenantId, 'DATA_ENTRY', null);
    await cyc.transition(c.id, tenantId, 'SELF_ASSESSMENT', null);
    await cyc.selfAssess(sid, tenantId, reportEmpId, { selfComment: 'ok' });
    await cyc.transition(c.id, tenantId, 'PENDING_REVIEW', null);

    const returned = await cyc.reviewScorecard(sid, tenantId, mgrActor(), { decision: 'RETURNED', note: 'Bổ sung minh chứng' });
    expect(returned.scorecards[0].status).toBe('SELF_ASSESSED');

    // Người không phải quản lý của scorecard này không được gửi lại.
    await expect(cyc.resubmitScorecard(sid, tenantId, hrActor())).rejects.toMatchObject({ statusCode: 403 });

    const resubmitted = await cyc.resubmitScorecard(sid, tenantId, mgrActor());
    const sc = resubmitted.scorecards[0];
    expect(sc.status).toBe('IN_REVIEW');
    expect(sc.approvals.some((a) => a.round === 2)).toBe(true);
  });

  it('auto-skips the Manager step when the employee has no manager', async () => {
    const solo = await makeEmp('solo@rev.test', 'EMPLOYEE', deptId, null); // no manager
    const { frameworkId } = await buildBalancedFramework('Rev FW 3', [deptId]);
    const c = await cyc.create(tenantId, { frameworkId, period: '2026-05', periodType: 'MONTHLY' }, null);
    const soloSc = c.scorecards.find((s) => s.employeeId === solo)!;
    await cyc.transition(c.id, tenantId, 'DATA_ENTRY', null);
    await cyc.transition(c.id, tenantId, 'PENDING_REVIEW', null);
    const detail = await cyc.getDetail(c.id, tenantId);
    const sc = detail.scorecards.find((s) => s.id === soloSc.id)!;
    // Manager step auto-skipped → currentStep jumps to HR (step 2)
    const mgrStep = sc.approvals.find((a) => a.stepOrder === 1);
    expect(mgrStep?.decision).toBe('AUTO_SKIPPED');
    expect(sc.currentStep).toBe(2);
  });
});
