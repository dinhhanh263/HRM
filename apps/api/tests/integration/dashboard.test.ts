import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'dashboard-test-tenant';
const OTHER_SLUG = 'dashboard-other-tenant';
const HR_EMAIL = 'hr@dashboard-test.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@dashboard-test.com';
const NOACCESS_PASSWORD = 'NoAccess@123';
const SELF_EMAIL = 'self@dashboard-test.com';
const SELF_PASSWORD = 'SelfTest@123';
const MGR_EMAIL = 'mgr@dashboard-test.com';
const MGR_PASSWORD = 'MgrTest@123';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function cleanup(tenantId: string) {
  await db.leaveRequest.deleteMany({ where: { tenantId } });
  await db.leaveType.deleteMany({ where: { tenantId } });
  await db.contract.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.holiday.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

describe('Dashboard API', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let selfToken: string;
  let mgrToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Dashboard Test Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Dashboard Other Tenant', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;

    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.department.deleteMany({ where: { tenantId } });

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

    // A user whose custom role grants no permissions at all → must be 403'd.
    const noAccessRole = await db.role.create({
      data: { tenantId, key: 'no-access', name: 'No Access', isSystem: false },
    });
    const noAccessUser = await db.user.create({
      data: {
        tenantId,
        email: NOACCESS_EMAIL,
        passwordHash: await hashPassword(NOACCESS_PASSWORD),
        fullName: 'No Access',
        role: 'EMPLOYEE',
        roleId: noAccessRole.id,
        status: 'ACTIVE',
      },
    });

    const deptA = await db.department.create({ data: { tenantId, name: 'Engineering' } });
    const deptB = await db.department.create({ data: { tenantId, name: 'Sales' } });

    // emp1: active, dept A, joined this month (new hire). Login-capable so it
    // doubles as the EMPLOYEE self-service caller — keeps the company fixture intact.
    const emp1User = await db.user.create({
      data: { tenantId, email: SELF_EMAIL, passwordHash: await hashPassword(SELF_PASSWORD), fullName: 'Emp One', role: 'EMPLOYEE', roleId: roleIdByKey.get('employee'), status: 'ACTIVE' },
    });
    const emp1 = await db.employee.create({
      data: { tenantId, userId: emp1User.id, employeeCode: 'D-1', fullName: 'Emp One', departmentId: deptA.id, joinDate: new Date(), contractType: 'FULL_TIME', status: 'ACTIVE' },
    });
    // emp2: active, dept A, old hire — "on leave today". Login-capable MANAGER so
    // it doubles as the team-scope caller; emp1 (below) reports to it.
    const emp2User = await db.user.create({
      data: { tenantId, email: MGR_EMAIL, passwordHash: await hashPassword(MGR_PASSWORD), fullName: 'Emp Two', role: 'MANAGER', roleId: roleIdByKey.get('manager'), status: 'ACTIVE' },
    });
    const emp2 = await db.employee.create({
      data: { tenantId, userId: emp2User.id, employeeCode: 'D-2', fullName: 'Emp Two', departmentId: deptA.id, joinDate: new Date('2023-01-01'), contractType: 'FULL_TIME', status: 'ACTIVE' },
    });
    // emp1 reports directly to emp2 → emp2's team scope = { emp2 (self), emp1 }.
    // Also give emp1 a probation end (within the 7-day lead) and an ACTIVE contract
    // expiring within the 30-day lead → both lifecycle event kinds are due. They must
    // surface for HR (company scope) but never for the MANAGER/EMPLOYEE who also see emp1.
    await db.employee.update({
      where: { id: emp1.id },
      data: { managerId: emp2.id, probationEndDate: daysFromNow(5) },
    });
    await db.contract.create({
      data: {
        tenantId,
        employeeId: emp1.id,
        type: 'FULL_TIME',
        startDate: new Date('2026-01-01'),
        endDate: daysFromNow(20),
        status: 'ACTIVE',
      },
    });
    // emp3: active, dept B, old hire
    const emp3User = await db.user.create({
      data: { tenantId, email: 'e3@dashboard-test.com', passwordHash: 'x', fullName: 'Emp Three', role: 'EMPLOYEE', status: 'ACTIVE' },
    });
    await db.employee.create({
      data: { tenantId, userId: emp3User.id, employeeCode: 'D-3', fullName: 'Emp Three', departmentId: deptB.id, joinDate: new Date('2023-06-01'), contractType: 'FULL_TIME', status: 'ACTIVE' },
    });
    // emp4: terminated this month, dept B
    const emp4User = await db.user.create({
      data: { tenantId, email: 'e4@dashboard-test.com', passwordHash: 'x', fullName: 'Emp Four', role: 'EMPLOYEE', status: 'INACTIVE' },
    });
    await db.employee.create({
      data: { tenantId, userId: emp4User.id, employeeCode: 'D-4', fullName: 'Emp Four', departmentId: deptB.id, joinDate: new Date('2022-01-01'), contractType: 'FULL_TIME', status: 'TERMINATED', terminatedAt: new Date() },
    });

    const annual = await db.leaveType.create({
      data: { tenantId, name: 'Annual', code: 'ANNUAL', colorHex: '#3B82F6', defaultDays: 12 },
    });
    // emp1's own PENDING request → company pendingApprovals = 1, and (since emp1
    // is the login-capable self-service employee) its myPendingRequests = 1.
    await db.leaveRequest.create({
      data: { tenantId, employeeId: emp1.id, leaveTypeId: annual.id, startDate: daysFromNow(5), endDate: daysFromNow(6), totalDays: 2, status: 'PENDING' },
    });
    // APPROVED request bracketing today → onLeaveToday = 1
    await db.leaveRequest.create({
      data: { tenantId, employeeId: emp2.id, leaveTypeId: annual.id, startDate: daysFromNow(-1), endDate: daysFromNow(1), totalDays: 3, status: 'APPROVED' },
    });

    // SPEC-035: a holiday in the same month as emp1's probation end — the
    // calendar endpoint must return it (tenant-wide) alongside scoped events.
    const probDate = daysFromNow(5);
    await db.holiday.create({
      data: {
        tenantId,
        date: new Date(Date.UTC(probDate.getFullYear(), probDate.getMonth(), probDate.getDate())),
        name: 'Dashboard Test Holiday',
      },
    });

    // Other tenant: 5 active employees that must NOT leak into tenant A counts.
    for (let i = 0; i < 5; i++) {
      const u = await db.user.create({
        data: { tenantId: otherTenantId, email: `other${i}@dashboard-other.com`, passwordHash: 'x', fullName: `Other ${i}`, role: 'EMPLOYEE', status: 'ACTIVE' },
      });
      await db.employee.create({
        data: { tenantId: otherTenantId, userId: u.id, employeeCode: `O-${i}`, fullName: `Other ${i}`, joinDate: new Date(), contractType: 'FULL_TIME', status: 'ACTIVE' },
      });
    }

    void noAccessUser;
    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;

    const selfLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: SELF_EMAIL, password: SELF_PASSWORD, tenantSlug: TENANT_SLUG });
    selfToken = selfLogin.body.data.accessToken;

    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: MGR_EMAIL, password: MGR_PASSWORD, tenantSlug: TENANT_SLUG });
    mgrToken = mgrLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.department.deleteMany({ where: { tenantId } });
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.tenant.delete({ where: { id: otherTenantId } });
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller lacks dashboard:view', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${noAccessToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with company-scoped stat counts for HR', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('HR_MANAGER');
    expect(res.body.data.stats).toEqual({
      totalActive: 3,
      onLeaveToday: 1,
      pendingApprovals: 1,
      newHiresThisMonth: 1,
      terminatedThisMonth: 1,
      departmentCount: 2,
    });
  });

  it('returns the active-headcount department distribution for HR, largest first', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.body.data.departmentDistribution).toEqual([
      { departmentId: expect.any(String), name: 'Engineering', count: 2 },
      { departmentId: expect.any(String), name: 'Sales', count: 1 },
    ]);
  });

  it('returns the scoped pending leave requests for HR', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.body.data.pendingLeave).toHaveLength(1);
    expect(res.body.data.pendingLeave[0]).toMatchObject({
      employeeName: 'Emp One',
      totalDays: 2,
      leaveType: { name: 'Annual', colorHex: '#3B82F6' },
    });
  });

  it('surfaces a new_joiner upcoming event for the employee who joined today', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    const joiners = res.body.data.upcomingEvents.filter(
      (e: { kind: string }) => e.kind === 'new_joiner',
    );
    expect(joiners).toContainEqual(
      expect.objectContaining({ employeeName: 'Emp One', department: 'Engineering' }),
    );
  });

  it('does not leak the other tenant employees into the counts', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);
    // tenant B has 5 active employees; tenant A must still report only 3
    expect(res.body.data.stats.totalActive).toBe(3);
  });

  it('returns self-service leave balance and own pending count for an EMPLOYEE', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${selfToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('EMPLOYEE');
    // self scope → no company-only distribution
    expect(res.body.data.departmentDistribution).toBeUndefined();
    // own pending request only (not the company-wide pending count of 1 from emp1)
    expect(res.body.data.stats.myPendingRequests).toBe(1);

    expect(Array.isArray(res.body.data.myLeaveBalance)).toBe(true);
    const annual = res.body.data.myLeaveBalance.find(
      (b: { leaveType: { name: string } }) => b.leaveType.name === 'Annual',
    );
    expect(annual).toMatchObject({ leaveType: { name: 'Annual', colorHex: '#3B82F6' }, allocated: 12 });
  });

  it('scopes a MANAGER to their team (self + direct reports), excluding out-of-team staff', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${mgrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('MANAGER');
    // team = { emp2 (self, on leave today), emp1 (report, new hire + pending) }.
    // emp3 (Sales) and emp4 (terminated) are out of team → must not be counted.
    expect(res.body.data.stats).toMatchObject({
      totalActive: 2,
      onLeaveToday: 1,
      pendingApprovals: 1,
      newHiresThisMonth: 1,
      terminatedThisMonth: 0,
      departmentCount: 1,
    });
    // team scope → no company-only department distribution
    expect(res.body.data.departmentDistribution).toBeUndefined();
    // only the report's pending request is visible to the manager
    expect(res.body.data.pendingLeave).toHaveLength(1);
    expect(res.body.data.pendingLeave[0]).toMatchObject({ employeeName: 'Emp One' });
  });

  it('surfaces probation_ending and contract_expiring events for HR (company scope)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    const kinds = res.body.data.upcomingEvents.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('probation_ending');
    expect(kinds).toContain('contract_expiring');
    expect(res.body.data.upcomingEvents).toContainEqual(
      expect.objectContaining({ kind: 'probation_ending', employeeName: 'Emp One' }),
    );
    expect(res.body.data.upcomingEvents).toContainEqual(
      expect.objectContaining({ kind: 'contract_expiring', employeeName: 'Emp One' }),
    );
    // SPEC-034 §1: every event carries the employee id for deep-linking.
    for (const event of res.body.data.upcomingEvents) {
      expect(typeof event.employeeId).toBe('string');
      expect(event.employeeId.length).toBeGreaterThan(0);
    }
  });

  // SPEC-034 §2: a MANAGER sees probation_ending for direct reports (deep-link
  // to the review screen), but contracts stay HR-only.
  it("surfaces a report's probation_ending (but not contract_expiring) for their MANAGER", async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${mgrToken}`);

    const kinds = res.body.data.upcomingEvents.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('probation_ending');
    expect(kinds).not.toContain('contract_expiring');
    expect(res.body.data.upcomingEvents).toContainEqual(
      expect.objectContaining({ kind: 'probation_ending', employeeName: 'Emp One' }),
    );
  });

  it('hides lifecycle events from an EMPLOYEE viewing their own dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${selfToken}`);

    const kinds = res.body.data.upcomingEvents.map((e: { kind: string }) => e.kind);
    expect(kinds).not.toContain('probation_ending');
    expect(kinds).not.toContain('contract_expiring');
  });

  // SPEC-035 — month view of the event calendar, same scope boundary as the
  // dashboard plus tenant holidays.
  describe('GET /api/v1/dashboard/events', () => {
    const isoMonth = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // emp1's probation ends at daysFromNow(5), its contract at daysFromNow(20).
    const probationMonth = () => isoMonth(daysFromNow(5));
    const contractMonth = () => isoMonth(daysFromNow(20));

    it('returns month events + holidays for HR (company scope)', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/events?month=${probationMonth()}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.month).toBe(probationMonth());
      expect(res.body.data.events).toContainEqual(
        expect.objectContaining({ kind: 'probation_ending', employeeName: 'Emp One' }),
      );
      for (const event of res.body.data.events) {
        expect(typeof event.employeeId).toBe('string');
      }
      expect(res.body.data.holidays).toContainEqual(
        expect.objectContaining({ name: 'Dashboard Test Holiday' }),
      );
    });

    it('shows contract_expiring to HR in the month it falls', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/events?month=${contractMonth()}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.events).toContainEqual(
        expect.objectContaining({ kind: 'contract_expiring', employeeName: 'Emp One' }),
      );
    });

    it("shows a MANAGER the report's probation in-month, but never contracts", async () => {
      const probRes = await request(app)
        .get(`/api/v1/dashboard/events?month=${probationMonth()}`)
        .set('Authorization', `Bearer ${mgrToken}`);
      expect(probRes.status).toBe(200);
      expect(probRes.body.data.events).toContainEqual(
        expect.objectContaining({ kind: 'probation_ending', employeeName: 'Emp One' }),
      );

      const contractRes = await request(app)
        .get(`/api/v1/dashboard/events?month=${contractMonth()}`)
        .set('Authorization', `Bearer ${mgrToken}`);
      const kinds = contractRes.body.data.events.map((e: { kind: string }) => e.kind);
      expect(kinds).not.toContain('contract_expiring');
    });

    it('hides lifecycle events from an EMPLOYEE but still returns holidays', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/events?month=${probationMonth()}`)
        .set('Authorization', `Bearer ${selfToken}`);

      expect(res.status).toBe(200);
      const kinds = res.body.data.events.map((e: { kind: string }) => e.kind);
      expect(kinds).not.toContain('probation_ending');
      expect(kinds).not.toContain('contract_expiring');
      expect(res.body.data.holidays).toContainEqual(
        expect.objectContaining({ name: 'Dashboard Test Holiday' }),
      );
    });

    it('rejects a malformed or missing month with 422', async () => {
      const bad = await request(app)
        .get('/api/v1/dashboard/events?month=2026-13')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(bad.status).toBe(422);

      const missing = await request(app)
        .get('/api/v1/dashboard/events')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(missing.status).toBe(422);
    });

    it('requires authentication and dashboard:view', async () => {
      const anon = await request(app).get('/api/v1/dashboard/events?month=2026-06');
      expect(anon.status).toBe(401);

      const forbidden = await request(app)
        .get('/api/v1/dashboard/events?month=2026-06')
        .set('Authorization', `Bearer ${noAccessToken}`);
      expect(forbidden.status).toBe(403);
    });
  });
});
