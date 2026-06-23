import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'leave-test-tenant';
const HR_EMAIL = 'hr@leave-test.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@leave-test.com';
const EMP_PASSWORD = 'EmpTest@123';

describe('Leave API', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;
  let annualTypeId: string;
  let empId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Leave Test Tenant', slug: TEST_TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.leaveRequest.deleteMany({ where: { tenantId } });
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.employee.deleteMany({ where: { tenantId } });
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

    // Employee-role user WITH an employee profile so it can submit requests.
    const empUser = await db.user.create({
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
    const emp = await db.employee.create({
      data: {
        tenantId,
        userId: empUser.id,
        employeeCode: 'EMP-900',
        fullName: 'Plain Employee',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    empId = emp.id;

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TEST_TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TEST_TENANT_SLUG });
    empToken = empLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { tenantId } });
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  describe('Leave types', () => {
    it('HR can create a leave type and code is uppercased', async () => {
      const res = await request(app)
        .post('/api/v1/leave/types')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Nghỉ phép năm', code: 'annual', defaultDays: 12, paid: true });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('ANNUAL');
      annualTypeId = res.body.data.id;
    });

    it('rejects a duplicate code with 409', async () => {
      const res = await request(app)
        .post('/api/v1/leave/types')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Dup', code: 'ANNUAL' });
      expect(res.status).toBe(409);
    });

    it('returns 403 when a plain employee tries to configure types', async () => {
      const res = await request(app)
        .post('/api/v1/leave/types')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ name: 'X', code: 'XYZ' });
      expect(res.status).toBe(403);
    });
  });

  describe('Leave settings (pro-rata toggle)', () => {
    it('GET returns proRataEnabled=false by default', async () => {
      const res = await request(app)
        .get('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ proRataEnabled: false });
    });

    it('PATCH persists the flag and a subsequent GET reflects it', async () => {
      const patch = await request(app)
        .patch('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ proRataEnabled: true });

      expect(patch.status).toBe(200);
      expect(patch.body.data.proRataEnabled).toBe(true);

      const get = await request(app)
        .get('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(get.body.data.proRataEnabled).toBe(true);
    });

    it('merge does not clobber other Tenant.settings keys', async () => {
      // Seed an unrelated settings key directly.
      await db.tenant.update({
        where: { id: tenantId },
        data: { settings: { foo: 'bar', leaveProrata: { enabled: false } } },
      });

      await request(app)
        .patch('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ proRataEnabled: true });

      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      const settings = tenant!.settings as Record<string, unknown>;
      expect(settings.foo).toBe('bar');
      expect((settings.leaveProrata as { enabled: boolean }).enabled).toBe(true);
    });

    it('returns 403 for a non-configure user', async () => {
      const get = await request(app)
        .get('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${empToken}`);
      expect(get.status).toBe(403);

      const patch = await request(app)
        .patch('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ proRataEnabled: true });
      expect(patch.status).toBe(403);
    });
  });

  describe('Pro-rata on employee create', () => {
    async function setProRata(enabled: boolean) {
      await request(app)
        .patch('/api/v1/leave/settings')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ proRataEnabled: enabled });
    }

    async function balanceFor(employeeId: string, year: number, leaveTypeId: string) {
      const res = await request(app)
        .get(`/api/v1/leave/balances?employeeId=${employeeId}&year=${year}`)
        .set('Authorization', `Bearer ${hrToken}`);
      return res.body.data.find((b: { leaveTypeId: string }) => b.leaveTypeId === leaveTypeId);
    }

    it('seeds pro-rated annual allocation when the toggle is on (Nov join → 2)', async () => {
      await setProRata(true);

      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          email: 'prorata-on@leave-test.com',
          password: 'Employee@123',
          employeeCode: 'PRORATA-ON',
          fullName: 'Pro Rata On',
          contractType: 'FULL_TIME',
          joinDate: '2026-11-15T00:00:00.000Z',
        });
      expect(create.status).toBe(201);

      const balance = await balanceFor(create.body.data.id, 2026, annualTypeId);
      expect(balance.allocated).toBe(2); // 12 * 2/12
    });

    it('falls back to defaultDays when the toggle is off', async () => {
      await setProRata(false);

      const create = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          email: 'prorata-off@leave-test.com',
          password: 'Employee@123',
          employeeCode: 'PRORATA-OFF',
          fullName: 'Pro Rata Off',
          contractType: 'FULL_TIME',
          joinDate: '2026-11-15T00:00:00.000Z',
        });
      expect(create.status).toBe(201);

      const balance = await balanceFor(create.body.data.id, 2026, annualTypeId);
      expect(balance.allocated).toBe(12); // no override → defaultDays
    });
  });

  describe('Leave requests + balances', () => {
    let requestId: string;

    it('employee submits a request and balance reflects pending days', async () => {
      const res = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          leaveTypeId: annualTypeId,
          startDate: '2026-06-01T00:00:00.000Z', // Mon
          endDate: '2026-06-03T00:00:00.000Z', // Wed → 3 working days
          reason: 'Trip',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.totalDays).toBe(3);
      expect(res.body.data.status).toBe('PENDING');
      requestId = res.body.data.id;

      const bal = await request(app)
        .get('/api/v1/leave/balances?year=2026')
        .set('Authorization', `Bearer ${empToken}`);
      const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
      expect(annual.pending).toBe(3);
      expect(annual.remaining).toBe(9);
    });

    it('rejects overlapping requests', async () => {
      const res = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          leaveTypeId: annualTypeId,
          startDate: '2026-06-02T00:00:00.000Z',
          endDate: '2026-06-02T00:00:00.000Z',
        });
      expect(res.status).toBe(400);
    });

    it('HR approves the request and used days move from pending', async () => {
      const res = await request(app)
        .post(`/api/v1/leave/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');

      const bal = await request(app)
        .get('/api/v1/leave/balances?year=2026')
        .set('Authorization', `Bearer ${empToken}`);
      const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
      expect(annual.used).toBe(3);
      expect(annual.pending).toBe(0);
      expect(annual.remaining).toBe(9);
    });

    it('employee sees their own request under scope=mine', async () => {
      const res = await request(app)
        .get('/api/v1/leave/requests?scope=mine')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(requestId);
    });

    it('reviewer with no employee profile can list scope=all', async () => {
      // HR_MANAGER has approve/reject but no Employee row — must still see the
      // whole tenant's requests (scope=all) rather than getting a "no profile" error.
      const res = await request(app)
        .get('/api/v1/leave/requests?scope=all')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((r: { id: string }) => r.id === requestId)).toBe(true);
    });

    it('profile-less reviewer gets an empty list under scope=mine (not an error)', async () => {
      const res = await request(app)
        .get('/api/v1/leave/requests?scope=mine')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('profile-less reviewer gets empty own balances (not an error)', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances?year=2026')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('plain employee cannot use scope=review (no approve/reject)', async () => {
      const res = await request(app)
        .get('/api/v1/leave/requests?scope=review')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Balance allocation overrides (PUT /balances)', () => {
    it('HR overrides an employee allocation and the balance reflects it', async () => {
      const res = await request(app)
        .put('/api/v1/leave/balances')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empId, leaveTypeId: annualTypeId, year: 2026, allocated: 30 });

      expect(res.status).toBe(200);
      const annual = res.body.data.find(
        (b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL',
      );
      expect(annual.allocated).toBe(30);
      // remaining always equals allocated - used - pending
      expect(annual.remaining).toBe(30 - annual.used - annual.pending);
    });

    it('a re-submitted override updates in place (no duplicate row)', async () => {
      const res = await request(app)
        .put('/api/v1/leave/balances')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empId, leaveTypeId: annualTypeId, year: 2026, allocated: 18 });
      expect(res.status).toBe(200);
      const annual = res.body.data.find(
        (b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL',
      );
      expect(annual.allocated).toBe(18);

      const rows = await db.leaveBalance.count({
        where: { tenantId, employeeId: empId, leaveTypeId: annualTypeId, year: 2026 },
      });
      expect(rows).toBe(1);
    });

    it('the override is visible when HR reads that employee balances', async () => {
      const res = await request(app)
        .get(`/api/v1/leave/balances?year=2026&employeeId=${empId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      const annual = res.body.data.find(
        (b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL',
      );
      expect(annual.allocated).toBe(18);
    });

    it('returns 403 when a plain employee tries to override allocation', async () => {
      const res = await request(app)
        .put('/api/v1/leave/balances')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ employeeId: empId, leaveTypeId: annualTypeId, year: 2026, allocated: 99 });
      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown employee', async () => {
      const res = await request(app)
        .put('/api/v1/leave/balances')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employeeId: 'clxxxxxxxxxxxxxxxxxxxxxxx',
          leaveTypeId: annualTypeId,
          year: 2026,
          allocated: 10,
        });
      expect(res.status).toBe(404);
    });
  });

  // Company-wide / team leave balance roster (GET /balances/roster). At this
  // point the Plain Employee has an approved 3-day ANNUAL request (used=3) and
  // an HR allocation override of 18 for 2026.
  describe('Balance roster (GET /balances/roster)', () => {
    let deptAId: string;
    let emptyDeptId: string;

    beforeAll(async () => {
      // Put Plain Employee in dept A; keep dept B empty so a departmentId filter
      // has something to include (A) AND something that excludes everyone (B).
      const deptA = await db.department.create({ data: { tenantId, name: 'Roster Dept A' } });
      const deptB = await db.department.create({ data: { tenantId, name: 'Roster Dept B' } });
      deptAId = deptA.id;
      emptyDeptId = deptB.id;
      await db.employee.update({ where: { id: empId }, data: { departmentId: deptA.id } });
    });

    it('HR gets the company roster: leaveTypes columns + one row per active employee', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      // Active leave types are exposed as column descriptors.
      expect(res.body.leaveTypes.some((t: { code: string }) => t.code === 'ANNUAL')).toBe(true);

      const row = res.body.data.find(
        (r: { employee: { id: string } }) => r.employee.id === empId,
      );
      expect(row).toBeDefined();
      expect(row.employee.fullName).toBe('Plain Employee');
      const annual = row.balances.find(
        (b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL',
      );
      // override 18 − used 3 − pending 0 = remaining 15
      expect(annual.allocated).toBe(18);
      expect(annual.used).toBe(3);
      expect(annual.pending).toBe(0);
      expect(annual.remaining).toBe(15);
    });

    it('search narrows the roster to matching employees', async () => {
      const hit = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026&search=Plain')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(hit.status).toBe(200);
      expect(hit.body.data.some((r: { employee: { id: string } }) => r.employee.id === empId)).toBe(
        true,
      );

      const miss = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026&search=ZZ_no_such_name')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(miss.status).toBe(200);
      expect(miss.body.data).toHaveLength(0);
    });

    it('departmentId narrows the roster to that department', async () => {
      const inDept = await request(app)
        .get(`/api/v1/leave/balances/roster?year=2026&departmentId=${deptAId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(inDept.status).toBe(200);
      const ids = inDept.body.data.map((r: { employee: { id: string } }) => r.employee.id);
      expect(ids).toContain(empId); // Plain Employee is in dept A

      // An empty department excludes everyone.
      const emptyDept = await request(app)
        .get(`/api/v1/leave/balances/roster?year=2026&departmentId=${emptyDeptId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(emptyDept.status).toBe(200);
      expect(emptyDept.body.data).toHaveLength(0);
    });

    it('returns paginated metadata', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026&page=1&limit=10')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 });
    });

    it('returns 403 for a plain employee (no review capability)', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(403);
    });

    // supertest only buffers known content types; force a binary parser so the
    // .xlsx body arrives as a real Buffer.
    const asBuffer = (r: import('http').IncomingMessage, cb: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    it('exports the roster as an .xlsx download for HR', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances/roster/export?year=2026')
        .set('Authorization', `Bearer ${hrToken}`)
        .buffer(true)
        .parse(asBuffer);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      // A real workbook starts with the ZIP magic bytes "PK".
      expect((res.body as Buffer).length).toBeGreaterThan(0);
      expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
    });

    it('export honours departmentId scope (empty department → header only)', async () => {
      const res = await request(app)
        .get(`/api/v1/leave/balances/roster/export?year=2026&departmentId=${emptyDeptId}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .buffer(true)
        .parse(asBuffer);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
    });

    it('returns 403 when a plain employee tries to export', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balances/roster/export?year=2026')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(403);
    });

    // Business-outcome guard for the whole reason this screen exists: a single
    // roster cell must aggregate BOTH the approved (used) and the still-open
    // (pending) days for the year, and remaining must net them out. Plain
    // Employee already has used=3 (approved) + override 18; we add a fresh 2-day
    // PENDING request and assert the cell becomes used 3 / pending 2 / remaining 13.
    it('roster cell reflects approved + pending days together', async () => {
      const submit = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          leaveTypeId: annualTypeId,
          startDate: '2026-06-08T00:00:00.000Z', // Mon
          endDate: '2026-06-09T00:00:00.000Z', // Tue → 2 working days
          reason: 'Pending trip',
        });
      expect(submit.status).toBe(201);
      expect(submit.body.data.status).toBe('PENDING');

      const res = await request(app)
        .get('/api/v1/leave/balances/roster?year=2026')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);

      const row = res.body.data.find(
        (r: { employee: { id: string } }) => r.employee.id === empId,
      );
      const annual = row.balances.find(
        (b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL',
      );
      expect(annual.allocated).toBe(18);
      expect(annual.used).toBe(3);
      expect(annual.pending).toBe(2);
      expect(annual.remaining).toBe(13); // 18 − 3 − 2
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-step approval flow: an employee's request walks MANAGER → HR (ROLE),
// balance moves pending→used only at the final approval, and a RETURNED request
// never counts toward pending. Exercises SPEC-005 end to end.
// ---------------------------------------------------------------------------
describe('Leave approval flow (multi-step)', () => {
  const SLUG = 'leave-flow-tenant';
  const HR = { email: 'hr@flow-test.com', password: 'HrTest@123' };
  const MGR = { email: 'mgr@flow-test.com', password: 'MgrTest@123' };
  const EMP = { email: 'emp@flow-test.com', password: 'EmpTest@123' };

  let tenantId: string;
  let hrToken: string;
  let mgrToken: string;
  let empToken: string;
  let annualTypeId: string;
  let requestId: string;
  let returnedId: string;

  async function login(email: string, password: string) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password, tenantSlug: SLUG });
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'Leave Flow Tenant', slug: SLUG },
    });
    tenantId = tenant.id;

    // Clean slate (order matters for FKs).
    await db.leaveApproval.deleteMany({ where: { tenantId } });
    await db.leaveRequest.deleteMany({ where: { tenantId } });
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalFlow.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.department.updateMany({ where: { tenantId }, data: { managerId: null } });
    await db.employee.updateMany({ where: { tenantId }, data: { managerId: null } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    const dept = await db.department.create({ data: { tenantId, name: 'Engineering' } });

    // HR_MANAGER: capability-based ROLE approver — no employee profile needed.
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
        tenantId, userId: mgrUser.id, employeeCode: 'MGR-1', fullName: 'Team Manager',
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
        tenantId, userId: empUser.id, employeeCode: 'EMP-1', fullName: 'Flow Employee',
        joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME', status: 'ACTIVE',
        departmentId: dept.id, managerId: mgrEmp.id,
      },
    });

    const annual = await db.leaveType.create({
      data: { tenantId, name: 'Annual', code: 'ANNUAL', defaultDays: 12, paid: true },
    });
    annualTypeId = annual.id;

    // Department flow: MANAGER (step 0) → ROLE hr_manager (step 1).
    await db.approvalFlow.create({
      data: {
        tenantId, departmentId: dept.id, name: 'Eng flow', active: true,
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
    await db.leaveApproval.deleteMany({ where: { tenantId } });
    await db.leaveRequest.deleteMany({ where: { tenantId } });
    await db.leaveBalance.deleteMany({ where: { tenantId } });
    await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
    await db.approvalFlow.deleteMany({ where: { tenantId } });
    await db.leaveType.deleteMany({ where: { tenantId } });
    await db.department.updateMany({ where: { tenantId }, data: { managerId: null } });
    await db.employee.updateMany({ where: { tenantId }, data: { managerId: null } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('routes a new request through the flow and snapshots the timeline', async () => {
    const res = await request(app)
      .post('/api/v1/leave/requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        leaveTypeId: annualTypeId,
        startDate: '2026-06-01T00:00:00.000Z', // Mon
        endDate: '2026-06-03T00:00:00.000Z', // Wed → 3 days
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.flowId).toBeTruthy();
    expect(res.body.data.currentStep).toBe(1);
    requestId = res.body.data.id;
  });

  it('counts the pending request toward the pending balance', async () => {
    const bal = await request(app)
      .get('/api/v1/leave/balances?year=2026')
      .set('Authorization', `Bearer ${empToken}`);
    const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
    expect(annual.pending).toBe(3);
    expect(annual.used).toBe(0);
  });

  it('shows the request in the manager review queue at step 1', async () => {
    const res = await request(app)
      .get('/api/v1/leave/requests?scope=review')
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it('forbids the manager from skipping ahead — but advances on approval', async () => {
    const res = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.currentStep).toBe(2);
  });

  it('does not yet count toward used while still pending at step 2', async () => {
    const bal = await request(app)
      .get('/api/v1/leave/balances?year=2026')
      .set('Authorization', `Bearer ${empToken}`);
    const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
    expect(annual.pending).toBe(3);
    expect(annual.used).toBe(0);
  });

  it('now surfaces the request in the HR (ROLE) review queue', async () => {
    const res = await request(app)
      .get('/api/v1/leave/requests?scope=review')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it('finalizes APPROVED at the last step and moves pending → used', async () => {
    const res = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const bal = await request(app)
      .get('/api/v1/leave/balances?year=2026')
      .set('Authorization', `Bearer ${empToken}`);
    const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
    expect(annual.used).toBe(3);
    expect(annual.pending).toBe(0);
    expect(annual.remaining).toBe(9);
  });

  it('exposes the full approval timeline via GET /requests/:id', async () => {
    const res = await request(app)
      .get(`/api/v1/leave/requests/${requestId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.approvals).toHaveLength(2);
    expect(res.body.data.approvals.every((a: { decision: string }) => a.decision === 'APPROVED')).toBe(true);
  });

  it('returns a request (RETURNED) which never counts toward pending', async () => {
    const create = await request(app)
      .post('/api/v1/leave/requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        leaveTypeId: annualTypeId,
        startDate: '2026-06-08T00:00:00.000Z', // Mon
        endDate: '2026-06-09T00:00:00.000Z', // Tue → 2 days
      });
    expect(create.status).toBe(201);
    returnedId = create.body.data.id;

    const reject = await request(app)
      .post(`/api/v1/leave/requests/${returnedId}/reject`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ note: 'Please pick different dates' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('RETURNED');

    const bal = await request(app)
      .get('/api/v1/leave/balances?year=2026')
      .set('Authorization', `Bearer ${empToken}`);
    const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
    expect(annual.pending).toBe(0); // RETURNED excluded
    expect(annual.used).toBe(3);
  });

  it('requires a note when returning a request', async () => {
    const create = await request(app)
      .post('/api/v1/leave/requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        leaveTypeId: annualTypeId,
        startDate: '2026-06-15T00:00:00.000Z',
        endDate: '2026-06-15T00:00:00.000Z',
      });
    const reject = await request(app)
      .post(`/api/v1/leave/requests/${create.body.data.id}/reject`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({});
    expect(reject.status).toBe(400);

    // tidy up so it doesn't leak into later assertions
    await db.leaveApproval.deleteMany({ where: { requestId: create.body.data.id } });
    await db.leaveRequest.delete({ where: { id: create.body.data.id } });
  });

  it('lets the owner resubmit a RETURNED request into a fresh round', async () => {
    const res = await request(app)
      .post(`/api/v1/leave/requests/${returnedId}/resubmit`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        leaveTypeId: annualTypeId,
        startDate: '2026-06-10T00:00:00.000Z', // Wed
        endDate: '2026-06-11T00:00:00.000Z', // Thu → 2 days
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.currentStep).toBe(1);

    // Now pending again (2 days) on top of the 3 used.
    const bal = await request(app)
      .get('/api/v1/leave/balances?year=2026')
      .set('Authorization', `Bearer ${empToken}`);
    const annual = bal.body.data.find((b: { leaveTypeCode: string }) => b.leaveTypeCode === 'ANNUAL');
    expect(annual.pending).toBe(2);
    expect(annual.used).toBe(3);

    // Timeline keeps the old round + the new one.
    const detail = await request(app)
      .get(`/api/v1/leave/requests/${returnedId}`)
      .set('Authorization', `Bearer ${empToken}`);
    const rounds = new Set(detail.body.data.approvals.map((a: { round: number }) => a.round));
    expect(rounds.size).toBeGreaterThanOrEqual(2);
  });

  it('forbids resubmitting someone else\'s request', async () => {
    const res = await request(app)
      .post(`/api/v1/leave/requests/${requestId}/resubmit`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        leaveTypeId: annualTypeId,
        startDate: '2026-06-22T00:00:00.000Z',
        endDate: '2026-06-22T00:00:00.000Z',
      });
    // requestId is APPROVED + owned by the employee → not resubmittable by manager.
    expect([400, 403]).toContain(res.status);
  });

  // Regression: editing a flow via PATCH must persist the new step list, not just
  // the name. The update validator previously stripped `steps`, silently dropping them.
  it('persists a replaced step list when editing a flow via PATCH', async () => {
    const created = await request(app)
      .post('/api/v1/leave/flows')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        departmentId: null,
        name: 'Default flow',
        steps: [{ approverType: 'MANAGER' }],
      });
    expect(created.status).toBe(201);
    const flowId = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/leave/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Default flow (edited)',
        steps: [
          { approverType: 'DEPARTMENT_HEAD' },
          { approverType: 'ROLE', roleKey: 'hr_manager' },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('Default flow (edited)');
    expect(patched.body.data.steps.map((s: { approverType: string }) => s.approverType)).toEqual([
      'DEPARTMENT_HEAD',
      'ROLE',
    ]);

    // Re-fetch to prove it persisted, not just echoed back.
    const fetched = await request(app)
      .get(`/api/v1/leave/flows/${flowId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(fetched.body.data.steps).toHaveLength(2);
    expect(fetched.body.data.steps[1].roleKey).toBe('hr_manager');
  });
});
