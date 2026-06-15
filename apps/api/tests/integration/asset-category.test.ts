import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// AssetCategory CRUD — tenant-scoped, permission-driven:
//   GET    /assets/categories       → assets:view      (HR, MANAGER, EMPLOYEE)
//   POST   /assets/categories       → assets:configure (HR only)
//   PATCH  /assets/categories/:id    → assets:configure
//   DELETE /assets/categories/:id    → assets:configure; 409 if assets reference it
const TENANT_SLUG = 'asset-cat-tenant';
const OTHER_SLUG = 'asset-cat-other';
const HR_EMAIL = 'hr@asset-cat.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@asset-cat.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.asset.deleteMany({ where: { tenantId } });
  await db.assetCategory.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug = TENANT_SLUG): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug: slug });
  return res.body.data.accessToken;
}

describe('AssetCategory routes', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Asset Cat Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Asset Cat Other', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIdByKey = await syncSystemRolesForTenant(db, otherTenantId);

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
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });
    // Other-tenant category — must never be visible to our tenant.
    await db.assetCategory.create({
      data: { tenantId: otherTenantId, name: 'Foreign Laptops', code: 'FOREIGN' },
    });
    void otherRoleIdByKey;

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await db.tenant.delete({ where: { id: otherTenantId } });
  });

  describe('GET /assets/categories', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/assets/categories');
      expect(res.status).toBe(401);
    });

    it('returns 200 for EMPLOYEE (assets:view) and excludes other tenants', async () => {
      const res = await request(app)
        .get('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((c: { code: string }) => c.code === 'FOREIGN')).toBe(false);
    });
  });

  describe('POST /assets/categories', () => {
    it('returns 403 for EMPLOYEE (lacks assets:configure)', async () => {
      const res = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ name: 'Laptops', code: 'LAPTOP' });
      expect(res.status).toBe(403);
    });

    it('returns 201 for HR (assets:configure) with assetCount 0', async () => {
      const res = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Laptops', code: 'LAPTOP', description: 'Máy tính xách tay' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Laptops');
      expect(res.body.data.code).toBe('LAPTOP');
      expect(res.body.data.assetCount).toBe(0);
    });

    it('returns 409 on duplicate code within the tenant', async () => {
      const res = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Laptops 2', code: 'LAPTOP' });
      expect(res.status).toBe(409);
    });

    it('returns 422 on missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: '' });
      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /assets/categories/:id', () => {
    it('updates name but not code', async () => {
      const created = await db.assetCategory.create({
        data: { tenantId, name: 'Monitors', code: 'MONITOR' },
      });
      const res = await request(app)
        .patch(`/api/v1/assets/categories/${created.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'External Monitors' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('External Monitors');
      expect(res.body.data.code).toBe('MONITOR');
    });

    it('returns 404 for a category in another tenant', async () => {
      const foreign = await db.assetCategory.findFirst({
        where: { tenantId: otherTenantId, code: 'FOREIGN' },
      });
      const res = await request(app)
        .patch(`/api/v1/assets/categories/${foreign!.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /assets/categories/:id', () => {
    it('returns 204/200 when the category has no assets', async () => {
      const created = await db.assetCategory.create({
        data: { tenantId, name: 'Keyboards', code: 'KEYBOARD' },
      });
      const res = await request(app)
        .delete(`/api/v1/assets/categories/${created.id}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      const gone = await db.assetCategory.findUnique({ where: { id: created.id } });
      expect(gone).toBeNull();
    });

    it('returns 409 ASSET_CATEGORY_IN_USE when assets reference it', async () => {
      const cat = await db.assetCategory.create({
        data: { tenantId, name: 'Phones', code: 'PHONE' },
      });
      await db.asset.create({
        data: { tenantId, categoryId: cat.id, assetCode: 'PH-001', name: 'iPhone 15' },
      });
      const res = await request(app)
        .delete(`/api/v1/assets/categories/${cat.id}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_CATEGORY_IN_USE');
    });
  });
});
