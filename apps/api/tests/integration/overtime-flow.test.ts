import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'ot-flow-test-tenant';
const HR_EMAIL = 'hr@ot-flow-test.com';
const HR_PASSWORD = 'HrTest@123';
const MGR_EMAIL = 'mgr@ot-flow-test.com';
const MGR_PASSWORD = 'MgrTest@123';
const EMP_EMAIL = 'emp@ot-flow-test.com';
const EMP_PASSWORD = 'EmpTest@123';

// Phase 2 (SPEC-023): the OT flow config endpoints reuse ApprovalFlow with a
// flowType=OVERTIME discriminator and the timesheet:configure permission. These
// tests pin the RBAC contract (HR ok; MANAGER/EMPLOYEE → 403) and prove the
// flowType isolation: OT flows never leak into Leave's /flows and vice versa.
describe('Overtime approval flow config (/overtime/flows)', () => {
  let tenantId: string;
  let hrToken: string;
  let mgrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'OT Flow Test Tenant', slug: TEST_TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalFlow.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: MGR_EMAIL,
        passwordHash: await hashPassword(MGR_PASSWORD),
        fullName: 'Team Manager',
        role: 'MANAGER',
        roleId: roleIdByKey.get('manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const login = async (email: string, password: string) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password, tenantSlug: TEST_TENANT_SLUG });
      return res.body.data.accessToken as string;
    };
    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    mgrToken = await login(MGR_EMAIL, MGR_PASSWORD);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD);
  });

  afterAll(async () => {
    await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalFlow.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('lets HR create, read, edit and delete an OT flow', async () => {
    const created = await request(app)
      .post('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        departmentId: null,
        name: 'Default OT flow',
        steps: [{ approverType: 'MANAGER' }, { approverType: 'ROLE', roleKey: 'hr_manager' }],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.flowType).toBe('OVERTIME');
    const flowId = created.body.data.id;

    const list = await request(app)
      .get('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(flowId);

    const patched = await request(app)
      .patch(`/api/v1/timesheet/overtime/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Default OT flow (edited)', steps: [{ approverType: 'DEPARTMENT_HEAD' }] });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('Default OT flow (edited)');
    expect(patched.body.data.steps).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/timesheet/overtime/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(del.status).toBe(204);
  });

  it('forbids MANAGER (no timesheet:configure) from configuring OT flows', async () => {
    const list = await request(app)
      .get('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ departmentId: null, name: 'x', steps: [{ approverType: 'MANAGER' }] });
    expect(create.status).toBe(403);
  });

  it('forbids a plain EMPLOYEE from configuring OT flows', async () => {
    const create = await request(app)
      .post('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ departmentId: null, name: 'x', steps: [{ approverType: 'MANAGER' }] });
    expect(create.status).toBe(403);
  });

  it('isolates OT flows from Leave flows via flowType', async () => {
    const created = await request(app)
      .post('/api/v1/timesheet/overtime/flows')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ departmentId: null, name: 'OT only', steps: [{ approverType: 'MANAGER' }] });
    expect(created.status).toBe(201);

    // The OT flow must NOT show up under Leave's flow list (separate flowType).
    const leaveList = await request(app)
      .get('/api/v1/leave/flows')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(leaveList.status).toBe(200);
    expect(leaveList.body.data.every((f: { flowType: string }) => f.flowType === 'LEAVE')).toBe(true);

    // And Leave cannot fetch the OT flow by id (flowType guard → 404).
    const crossFetch = await request(app)
      .get(`/api/v1/leave/flows/${created.body.data.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(crossFetch.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Critical-path E2E (SPEC-023): an OT request walks MANAGER → HR (ROLE) across
// three real users. The observable business outcome is that the multiplier is
// snapshotted (pay settled) only at the FINAL step, and wrong-actor approvals are
// refused at each step. Also covers the RETURNED → resubmit (round+1) round-trip.
// ---------------------------------------------------------------------------
describe('Overtime approval flow lifecycle (multi-step E2E)', () => {
  const SLUG = 'ot-lifecycle-test-tenant';
  const HR = { email: 'hr@ot-life.com', password: 'HrTest@123' };
  const MGR = { email: 'mgr@ot-life.com', password: 'MgrTest@123' };
  const EMP = { email: 'emp@ot-life.com', password: 'EmpTest@123' };

  // 2026-05-30 is a Saturday (2026-06-06 is a known Saturday, exactly 7 days on),
  // so the request derives OT_WEEKEND and the work date is in the past.
  const WEEKEND_WORK_DATE = '2026-05-30';

  let tenantId: string;
  let hrToken: string;
  let mgrToken: string;
  let empToken: string;

  async function login(email: string, password: string) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password, tenantSlug: SLUG });
    return res.body.data.accessToken as string;
  }

  async function cleanup(id: string) {
    await db.overtimeApproval.deleteMany({ where: { tenantId: id } });
    await db.overtimeRequest.deleteMany({ where: { tenantId: id } });
    await db.approvalStep.deleteMany({ where: { flow: { tenantId: id } } });
    await db.approvalFlow.deleteMany({ where: { tenantId: id } });
    await db.employee.updateMany({ where: { tenantId: id }, data: { managerId: null } });
    await db.department.updateMany({ where: { tenantId: id }, data: { managerId: null } });
    await db.employee.deleteMany({ where: { tenantId: id } });
    await db.department.deleteMany({ where: { tenantId: id } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: id } } });
    await db.user.deleteMany({ where: { tenantId: id } });
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'OT Lifecycle Tenant', slug: SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    const dept = await db.department.create({ data: { tenantId, name: 'Engineering' } });

    // HR_MANAGER: capability ROLE approver — no employee profile needed.
    await db.user.create({
      data: {
        tenantId, email: HR.email, passwordHash: await hashPassword(HR.password),
        fullName: 'HR Manager', role: 'HR_MANAGER', roleId: roleIdByKey.get('hr_manager'), status: 'ACTIVE',
      },
    });

    // Direct manager (MANAGER role) with an employee profile.
    const mgrUser = await db.user.create({
      data: {
        tenantId, email: MGR.email, passwordHash: await hashPassword(MGR.password),
        fullName: 'Team Manager', role: 'MANAGER', roleId: roleIdByKey.get('manager'), status: 'ACTIVE',
      },
    });
    const mgrEmp = await db.employee.create({
      data: {
        tenantId, userId: mgrUser.id, employeeCode: 'OT-MGR-1', fullName: 'Team Manager',
        joinDate: new Date('2023-01-01'), contractType: 'FULL_TIME', status: 'ACTIVE', departmentId: dept.id,
      },
    });

    // Employee reporting to that manager.
    const empUser = await db.user.create({
      data: {
        tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password),
        fullName: 'Flow Employee', role: 'EMPLOYEE', roleId: roleIdByKey.get('employee'), status: 'ACTIVE',
      },
    });
    await db.employee.create({
      data: {
        tenantId, userId: empUser.id, employeeCode: 'OT-EMP-1', fullName: 'Flow Employee',
        joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', status: 'ACTIVE',
        departmentId: dept.id, managerId: mgrEmp.id,
      },
    });

    // OT flow: MANAGER (step 0) → ROLE hr_manager (step 1).
    await db.approvalFlow.create({
      data: {
        tenantId, departmentId: dept.id, name: 'Eng OT flow', active: true,
        flowType: 'OVERTIME',
        steps: {
          create: [
            { stepOrder: 0, approverType: 'MANAGER' },
            { stepOrder: 1, approverType: 'ROLE', roleKey: 'hr_manager' },
          ],
        },
      },
    });

    hrToken = await login(HR.email, HR.password);
    mgrToken = await login(MGR.email, MGR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  let requestId: string;

  it('routes a new OT request through the flow (PENDING at step 1, unsettled)', async () => {
    const res = await request(app)
      .post('/api/v1/timesheet/overtime')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ workDate: WEEKEND_WORK_DATE, hours: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.flowId).toBeTruthy();
    expect(res.body.data.currentStep).toBe(1);
    expect(res.body.data.category).toBe('OT_WEEKEND');
    expect(res.body.data.multiplier).toBeNull(); // not settled until final approval
    requestId = res.body.data.id;
  });

  it('forbids an employee (no timesheet:approve) from approving', async () => {
    const res = await request(app)
      .post(`/api/v1/timesheet/overtime/${requestId}/approve`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });

  it('forbids the HR (step 2 approver) from approving while step 1 is current', async () => {
    const res = await request(app)
      .post(`/api/v1/timesheet/overtime/${requestId}/approve`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OVERTIME_NOT_CURRENT_APPROVER');
  });

  it('advances on the manager approval without settling pay', async () => {
    const res = await request(app)
      .post(`/api/v1/timesheet/overtime/${requestId}/approve`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(200);
    // approve returns { overtime, warnings }.
    expect(res.body.data.overtime.status).toBe('PENDING');
    expect(res.body.data.overtime.currentStep).toBe(2);
    expect(res.body.data.overtime.multiplier).toBeNull(); // still unsettled at the middle step
  });

  it('forbids the manager from acting again at the HR (ROLE) step', async () => {
    const res = await request(app)
      .post(`/api/v1/timesheet/overtime/${requestId}/approve`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OVERTIME_NOT_CURRENT_APPROVER');
  });

  it('settles pay (multiplier snapshotted) and marks APPROVED at the final step', async () => {
    const res = await request(app)
      .post(`/api/v1/timesheet/overtime/${requestId}/approve`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.overtime.status).toBe('APPROVED');
    // The observable business outcome: a positive pay multiplier is now frozen.
    expect(typeof res.body.data.overtime.multiplier).toBe('number');
    expect(res.body.data.overtime.multiplier).toBeGreaterThan(0);
  });

  it('returns then resubmits a second request, opening a fresh round (round+1)', async () => {
    // New request walks to step 1.
    const submit = await request(app)
      .post('/api/v1/timesheet/overtime')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ workDate: WEEKEND_WORK_DATE, hours: 2 });
    expect(submit.status).toBe(201);
    const id = submit.body.data.id;

    // Wrong actor (HR) cannot return at the manager's step.
    const wrongReturn = await request(app)
      .post(`/api/v1/timesheet/overtime/${id}/reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ note: 'not mine to return' });
    expect(wrongReturn.status).toBe(403);

    // Manager returns it (flow → RETURNED, not terminal REJECTED).
    const returned = await request(app)
      .post(`/api/v1/timesheet/overtime/${id}/reject`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ note: 'Please attach the ticket reference' });
    expect(returned.status).toBe(200);
    expect(returned.body.data.status).toBe('RETURNED');

    // Owner edits + resubmits → back to PENDING at step 1, round 2.
    const resubmit = await request(app)
      .patch(`/api/v1/timesheet/overtime/${id}/resubmit`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ workDate: WEEKEND_WORK_DATE, hours: 4 });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.data.status).toBe('PENDING');
    expect(resubmit.body.data.currentStep).toBe(1);

    // The timeline carries a round-2 set of approvals (history preserved).
    const detail = await request(app)
      .get(`/api/v1/timesheet/overtime/${id}`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.approvals.some((a: { round: number }) => a.round === 2)).toBe(true);
  });
});
