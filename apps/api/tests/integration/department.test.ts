import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// Regression for the Employee Management department/position filter bug: those
// read endpoints were gated by the legacy-enum isHROrAdmin guard, so a MANAGER
// (or any custom role) that legitimately holds departments:view / positions:view
// got 403 and the filter dropdown collapsed to just "All Departments". The routes
// must instead be permission-driven, mirroring employee.routes.
const TENANT_SLUG = 'dept-rbac-tenant';
const HR_EMAIL = 'hr@dept-rbac.com';
const HR_PASSWORD = 'HrTest@123';
const MGR_EMAIL = 'mgr@dept-rbac.com';
const MGR_PASSWORD = 'MgrTest@123';
const NOACCESS_EMAIL = 'noaccess@dept-rbac.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

async function cleanup(tenantId: string) {
  await db.position.deleteMany({ where: { tenantId } });
  await db.department.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug: TENANT_SLUG });
  return res.body.data.accessToken;
}

describe('Department & Position routes RBAC', () => {
  let tenantId: string;
  let hrToken: string;
  let mgrToken: string;
  let noAccessToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Dept RBAC Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

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

    // MANAGER holds departments:view + positions:view but NOT *:create.
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

    // Custom role granting no permissions → must stay 403 everywhere.
    const noAccessRole = await db.role.create({
      data: { tenantId, key: 'no-access', name: 'No Access', isSystem: false },
    });
    await db.user.create({
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

    await db.department.create({ data: { tenantId, name: 'Engineering' } });

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    mgrToken = await login(MGR_EMAIL, MGR_PASSWORD);
    noAccessToken = await login(NOACCESS_EMAIL, NOACCESS_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  describe('GET /departments', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/departments');
      expect(res.status).toBe(401);
    });

    it('returns 403 for a role with no permissions', async () => {
      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${noAccessToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 for HR (departments:view)', async () => {
      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 200 for a MANAGER who holds departments:view', async () => {
      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${mgrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /departments', () => {
    it('returns 403 for a MANAGER who lacks departments:create', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${mgrToken}`)
        .send({ name: 'Should Not Create' });
      expect(res.status).toBe(403);
    });

    it('returns 201 for HR (departments:create)', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Finance' });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /positions', () => {
    it('returns 403 for a role with no permissions', async () => {
      const res = await request(app)
        .get('/api/v1/positions')
        .set('Authorization', `Bearer ${noAccessToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 for a MANAGER who holds positions:view', async () => {
      const res = await request(app)
        .get('/api/v1/positions')
        .set('Authorization', `Bearer ${mgrToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /positions', () => {
    it('returns 403 for a MANAGER who lacks positions:create', async () => {
      const res = await request(app)
        .post('/api/v1/positions')
        .set('Authorization', `Bearer ${mgrToken}`)
        .send({ name: 'Should Not Create' });
      expect(res.status).toBe(403);
    });
  });
});
