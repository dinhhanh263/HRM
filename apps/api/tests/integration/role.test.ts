import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'roles-test-tenant';
const ADMIN_EMAIL = 'admin@roles-test.com';
const ADMIN_PASSWORD = 'AdminTest@123';
const EMP_EMAIL = 'emp@roles-test.com';
const EMP_PASSWORD = 'EmpTest@123';

describe('Roles API', () => {
  let tenantId: string;
  let adminToken: string;
  let employeeToken: string;

  async function cleanUsers() {
    await db.employee.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Roles Test Tenant', slug: TEST_TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanUsers();
    // Drop any custom roles from a previous run; keep nothing tenant-specific behind.
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId,
        email: ADMIN_EMAIL,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        roleId: roleIdByKey.get('super_admin'),
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

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    adminToken = adminLogin.body.data.accessToken;

    const empLogin = await request(app).post('/api/v1/auth/login').send({
      email: EMP_EMAIL,
      password: EMP_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    employeeToken = empLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanUsers();
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });
    await db.rolePermission.deleteMany({ where: { role: { tenantId } } });
    await db.role.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  describe('GET /api/v1/permissions', () => {
    it('should return the catalog grouped by resource', async () => {
      const res = await request(app)
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const employees = res.body.data.find((g: { resource: string }) => g.resource === 'employees');
      expect(employees).toBeDefined();
      expect(employees.actions.map((a: { key: string }) => a.key)).toContain('employees:create');
    });

    it('should return 403 when caller lacks roles:view', async () => {
      const res = await request(app)
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/roles', () => {
    it('should list system roles with permission + user counts', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const superAdmin = res.body.data.find((r: { key: string }) => r.key === 'super_admin');
      expect(superAdmin).toBeDefined();
      expect(superAdmin.isSystem).toBe(true);
      expect(superAdmin.permissionCount).toBeGreaterThan(0);
      expect(typeof superAdmin.userCount).toBe('number');
    });

    it('should return 403 when EMPLOYEE role lacks roles:view', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/roles', () => {
    it('should create a custom role with the chosen permissions', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Trưởng nhóm QA',
          description: 'Quản lý nhóm kiểm thử',
          permissions: ['dashboard:view', 'employees:view'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isSystem).toBe(false);
      expect(res.body.data.key).toBe('truong_nhom_qa');
      expect(res.body.data.permissions.sort()).toEqual(['dashboard:view', 'employees:view']);
    });

    it('should return 409 on duplicate name', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Trưởng nhóm QA', permissions: [] });

      expect(res.status).toBe(409);
    });

    it('should return 422 with an unknown permission key', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Role', permissions: ['employees:fly'] });

      expect(res.status).toBe(422);
    });

    it('should return 403 when caller lacks roles:create', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Denied Role', permissions: [] });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/roles/:id', () => {
    it('should update the permission set of a system role', async () => {
      const role = await db.role.findFirstOrThrow({ where: { tenantId, key: 'employee' } });
      const res = await request(app)
        .patch(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: ['dashboard:view'] });

      expect(res.status).toBe(200);
      expect(res.body.data.permissions).toEqual(['dashboard:view']);
    });

    it('should return 409 when renaming a system role', async () => {
      const role = await db.role.findFirstOrThrow({ where: { tenantId, key: 'employee' } });
      const res = await request(app)
        .patch(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed System Role' });

      expect(res.status).toBe(409);
    });

    it('should replace the permission set of a custom role', async () => {
      const created = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Editable Role', permissions: ['dashboard:view'] });
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/roles/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Editable Role Renamed', permissions: ['dashboard:view', 'employees:view', 'employees:create'] });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Editable Role Renamed');
      expect(res.body.data.permissions.sort()).toEqual(
        ['dashboard:view', 'employees:create', 'employees:view'],
      );
    });
  });

  describe('DELETE /api/v1/roles/:id', () => {
    it('should return 409 when deleting a system role', async () => {
      const role = await db.role.findFirstOrThrow({ where: { tenantId, key: 'manager' } });
      const res = await request(app)
        .delete(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });

    it('should return 409 when the role still has users assigned', async () => {
      const created = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Role With User', permissions: [] });
      const id = created.body.data.id;

      await db.user.create({
        data: {
          tenantId,
          email: 'assigned@roles-test.com',
          passwordHash: await hashPassword('Assigned@123'),
          fullName: 'Assigned User',
          role: 'EMPLOYEE',
          roleId: id,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .delete(`/api/v1/roles/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });

    it('should delete a custom role with no users assigned', async () => {
      const created = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Throwaway Role', permissions: [] });
      const id = created.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/roles/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(await db.role.findUnique({ where: { id } })).toBeNull();
    });
  });

  // Checkpoint B: a matrix edit must take effect end-to-end and be enforced
  // server-side for the Employees module (cache invalidated on save).
  describe('matrix edit takes effect e2e (Employees)', () => {
    it('should enforce a newly-granted permission on the next request', async () => {
      const created = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Scoped Role', permissions: ['employees:view'] });
      const roleId = created.body.data.id;

      const scopedEmail = 'scoped@roles-test.com';
      const scopedPassword = 'Scoped@123';
      await db.user.create({
        data: {
          tenantId,
          email: scopedEmail,
          passwordHash: await hashPassword(scopedPassword),
          fullName: 'Scoped User',
          role: 'EMPLOYEE',
          roleId,
          status: 'ACTIVE',
        },
      });

      const login = await request(app).post('/api/v1/auth/login').send({
        email: scopedEmail,
        password: scopedPassword,
        tenantSlug: TEST_TENANT_SLUG,
      });
      const scopedToken = login.body.data.accessToken;

      // Before: role lacks employees:create → denied.
      const before = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${scopedToken}`)
        .send({
          email: 'made-by-scoped@test.com',
          password: 'Employee@123',
          fullName: 'Created By Scoped',
          contractType: 'FULL_TIME',
        });
      expect(before.status).toBe(403);

      // Admin grants employees:create via the matrix (PATCH invalidates cache).
      await request(app)
        .patch(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: ['employees:view', 'employees:create'] });

      // After: same token, now allowed (not 403). Validation may make it 201/422,
      // but it must clear the permission gate.
      const after = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${scopedToken}`)
        .send({
          email: 'made-by-scoped@test.com',
          password: 'Employee@123',
          fullName: 'Created By Scoped',
          contractType: 'FULL_TIME',
        });
      expect(after.status).not.toBe(403);
    });
  });
});
