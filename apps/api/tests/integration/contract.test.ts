import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'contract-test-tenant';
const HR_USER_EMAIL = 'hr@contract-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const EMP_USER_EMAIL = 'emp@contract-test.com';
const EMP_USER_PASSWORD = 'EmpTest@123';
const SUBJECT_USER_EMAIL = 'subject@contract-test.com';
const SUBJECT_USER_PASSWORD = 'Subject@123';
const MANAGER_USER_EMAIL = 'manager@contract-test.com';
const MANAGER_USER_PASSWORD = 'Manager@123';

describe('Contract API (SPEC-017)', () => {
  let testTenantId: string;
  let hrToken: string;
  let employeeToken: string;
  let subjectToken: string;
  let managerToken: string;
  let employeeId: string;
  let outsiderEmployeeId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Contract Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    await db.contract.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: HR_USER_EMAIL,
        passwordHash: await hashPassword(HR_USER_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    // "Plain Employee" — linked to its OWN employee record. From the subject's
    // perspective this user is an outsider (not the owner, not the manager).
    const plainUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: EMP_USER_EMAIL,
        passwordHash: await hashPassword(EMP_USER_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const outsiderEmployee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: plainUser.id } },
        employeeCode: 'EMP-002',
        fullName: 'Plain Employee',
        joinDate: new Date('2026-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    outsiderEmployeeId = outsiderEmployee.id;

    // Manager who directly manages the subject employee (but NOT the outsider).
    const managerUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: MANAGER_USER_EMAIL,
        passwordHash: await hashPassword(MANAGER_USER_PASSWORD),
        fullName: 'Team Manager',
        role: 'MANAGER',
        roleId: roleIdByKey.get('manager'),
        status: 'ACTIVE',
      },
    });

    const managerEmployee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: managerUser.id } },
        employeeCode: 'EMP-100',
        fullName: 'Team Manager',
        joinDate: new Date('2026-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });

    const subjectUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: SUBJECT_USER_EMAIL,
        passwordHash: await hashPassword(SUBJECT_USER_PASSWORD),
        fullName: 'Contract Subject',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const employee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: subjectUser.id } },
        manager: { connect: { id: managerEmployee.id } },
        employeeCode: 'EMP-001',
        fullName: 'Contract Subject',
        joinDate: new Date('2026-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });
    employeeId = employee.id;

    const hrLogin = await request(app).post('/api/v1/auth/login').send({
      email: HR_USER_EMAIL,
      password: HR_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    hrToken = hrLogin.body.data.accessToken;

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      email: EMP_USER_EMAIL,
      password: EMP_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    employeeToken = empLogin.body.data.accessToken;

    const subjectLogin = await request(app).post('/api/v1/auth/login').send({
      email: SUBJECT_USER_EMAIL,
      password: SUBJECT_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    subjectToken = subjectLogin.body.data.accessToken;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      email: MANAGER_USER_EMAIL,
      password: MANAGER_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    managerToken = managerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await db.contract.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  describe('POST /api/v1/employees/:employeeId/contracts', () => {
    it('should create an ACTIVE contract (201)', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          type: 'FULL_TIME',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          note: 'First contract',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.employeeId).toBe(employeeId);
      expect(res.body.data.startDate).toContain('2026-01-01');
    });

    it('should enforce one-ACTIVE invariant: creating a 2nd contract expires the first', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          type: 'FULL_TIME',
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          note: 'Renewal',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ACTIVE');

      const contracts = await db.contract.findMany({
        where: { tenantId: testTenantId, employeeId },
      });
      const active = contracts.filter((c) => c.status === 'ACTIVE');
      expect(active).toHaveLength(1);
      expect(active[0].note).toBe('Renewal');
    });

    it('should return 403 when EMPLOYEE role lacks contracts:create', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'FULL_TIME', startDate: '2026-01-01' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/contracts`)
        .send({ type: 'FULL_TIME', startDate: '2026-01-01' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/employees/:employeeId/contracts', () => {
    it('should list contracts for the employee (HR)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should let an EMPLOYEE list their OWN contracts (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${subjectToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should forbid an EMPLOYEE from listing another employee\'s contracts (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('should let a MANAGER list a direct report\'s contracts (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should forbid a MANAGER from listing a non-report\'s contracts (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${outsiderEmployeeId}/contracts`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH + end + DELETE', () => {
    it('should update a contract note (HR)', async () => {
      const contract = await db.contract.findFirst({
        where: { tenantId: testTenantId, employeeId, status: 'ACTIVE' },
      });

      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}/contracts/${contract!.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ note: 'Updated note' });

      expect(res.status).toBe(200);
      expect(res.body.data.note).toBe('Updated note');
    });

    it('should end a contract: sets endDate + status TERMINATED', async () => {
      const contract = await db.contract.findFirst({
        where: { tenantId: testTenantId, employeeId, status: 'ACTIVE' },
      });

      const res = await request(app)
        .post(`/api/v1/employees/${employeeId}/contracts/${contract!.id}/end`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ endDate: '2027-06-30' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('TERMINATED');
      expect(res.body.data.endDate).toContain('2027-06-30');
    });

    it('should return 403 when EMPLOYEE tries to delete', async () => {
      const contract = await db.contract.findFirst({
        where: { tenantId: testTenantId, employeeId },
      });

      const res = await request(app)
        .delete(`/api/v1/employees/${employeeId}/contracts/${contract!.id}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('should delete a contract (HR)', async () => {
      const contract = await db.contract.create({
        data: {
          tenantId: testTenantId,
          employeeId,
          type: 'PART_TIME',
          startDate: new Date('2028-01-01'),
          status: 'EXPIRED',
        },
      });

      const res = await request(app)
        .delete(`/api/v1/employees/${employeeId}/contracts/${contract.id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      const found = await db.contract.findUnique({ where: { id: contract.id } });
      expect(found).toBeNull();
    });
  });

  describe('tenant isolation', () => {
    it('should return 404 for a contract belonging to another employee/tenant', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${employeeId}/contracts/nonexistent-id`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ note: 'hack' });

      expect(res.status).toBe(404);
    });
  });
});
