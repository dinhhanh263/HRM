import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// Asset catalog CRUD — tenant-scoped, permission-driven:
//   GET    /assets         → assets:view   (HR, MANAGER, EMPLOYEE)
//   GET    /assets/:id     → assets:view
//   POST   /assets         → assets:create (HR only)
//   PATCH  /assets/:id      → assets:update
//   DELETE /assets/:id      → assets:delete; 409 if assignment/maintenance history
const TENANT_SLUG = 'asset-tenant';
const OTHER_SLUG = 'asset-other';
const HR_EMAIL = 'hr@asset.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@asset.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.assetMaintenance.deleteMany({ where: { tenantId } });
  await db.assetAssignment.deleteMany({ where: { tenantId } });
  await db.asset.deleteMany({ where: { tenantId } });
  await db.assetCategory.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
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

describe('Asset routes', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let laptopCatId: string;
  let mouseCatId: string;
  let holderId: string; // an employee to hang assignment history on
  let foreignAssetId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Asset Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Asset Other', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    await syncSystemRolesForTenant(db, otherTenantId);

    const hrUser = await db.user.create({
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

    const laptopCat = await db.assetCategory.create({
      data: { tenantId, name: 'Laptops', code: 'LAPTOP' },
    });
    laptopCatId = laptopCat.id;
    const mouseCat = await db.assetCategory.create({
      data: { tenantId, name: 'Mice', code: 'MOUSE' },
    });
    mouseCatId = mouseCat.id;

    const holder = await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'EMP-H1',
        fullName: 'Asset Holder',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    holderId = holder.id;

    // Seed a spread of assets for list/filter/pagination assertions.
    await db.asset.createMany({
      data: [
        { tenantId, categoryId: laptopCatId, assetCode: 'LP-001', name: 'MacBook Pro 14', status: 'AVAILABLE' },
        { tenantId, categoryId: laptopCatId, assetCode: 'LP-002', name: 'Dell XPS 13', status: 'ASSIGNED' },
        { tenantId, categoryId: mouseCatId, assetCode: 'MS-001', name: 'Logitech MX', status: 'AVAILABLE' },
      ],
    });

    // Other-tenant asset — must never leak.
    const foreignCat = await db.assetCategory.create({
      data: { tenantId: otherTenantId, name: 'Foreign', code: 'FOREIGN' },
    });
    const foreignAsset = await db.asset.create({
      data: { tenantId: otherTenantId, categoryId: foreignCat.id, assetCode: 'FX-001', name: 'Foreign Laptop' },
    });
    foreignAssetId = foreignAsset.id;

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await db.tenant.delete({ where: { id: otherTenantId } });
  });

  describe('GET /assets', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/assets');
      expect(res.status).toBe(401);
    });

    it('returns 200 paginated for EMPLOYEE and excludes other tenants', async () => {
      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.data.some((a: { assetCode: string }) => a.assetCode === 'FX-001')).toBe(false);
      // Each row carries a compact category for the table.
      const lp = res.body.data.find((a: { assetCode: string }) => a.assetCode === 'LP-001');
      expect(lp.category.code).toBe('LAPTOP');
    });

    it('filters by categoryId', async () => {
      const res = await request(app)
        .get(`/api/v1/assets?categoryId=${mouseCatId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].assetCode).toBe('MS-001');
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get('/api/v1/assets?status=ASSIGNED')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].assetCode).toBe('LP-002');
    });

    it('searches by name or assetCode (case-insensitive)', async () => {
      const res = await request(app)
        .get('/api/v1/assets?search=macbook')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].assetCode).toBe('LP-001');
    });

    it('paginates', async () => {
      const res = await request(app)
        .get('/api/v1/assets?page=1&limit=2')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.totalPages).toBe(2);
    });
  });

  describe('GET /assets/export', () => {
    it('returns a CSV attachment with all matching rows and excludes other tenants', async () => {
      const res = await request(app)
        .get('/api/v1/assets/export')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.csv');
      // text/csv body lands in res.text.
      expect(res.text).toContain('LP-001');
      expect(res.text).toContain('LP-002');
      expect(res.text).not.toContain('FX-001');
    });

    it('returns 403 for EMPLOYEE (lacks assets:export)', async () => {
      const res = await request(app)
        .get('/api/v1/assets/export')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(403);
    });

    it('honors the status filter', async () => {
      const res = await request(app)
        .get('/api/v1/assets/export?status=ASSIGNED')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('LP-002');
      expect(res.text).not.toContain('LP-001');
    });
  });

  describe('GET /assets/:id', () => {
    it('returns detail with category, assignments and maintenances arrays', async () => {
      const asset = await db.asset.findFirst({ where: { tenantId, assetCode: 'LP-001' } });
      const res = await request(app)
        .get(`/api/v1/assets/${asset!.id}`)
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.assetCode).toBe('LP-001');
      expect(res.body.data.category.code).toBe('LAPTOP');
      expect(Array.isArray(res.body.data.assignments)).toBe(true);
      expect(Array.isArray(res.body.data.maintenances)).toBe(true);
    });

    it('returns 404 for an asset in another tenant', async () => {
      const res = await request(app)
        .get(`/api/v1/assets/${foreignAssetId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /assets', () => {
    it('returns 403 for EMPLOYEE (lacks assets:create)', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ categoryId: laptopCatId, assetCode: 'LP-100', name: 'New Laptop' });
      expect(res.status).toBe(403);
    });

    it('returns 201 for HR with status defaulting to AVAILABLE', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          categoryId: laptopCatId,
          assetCode: 'LP-201',
          name: 'ThinkPad X1',
          brand: 'Lenovo',
          purchaseCost: 25000000,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.assetCode).toBe('LP-201');
      expect(res.body.data.status).toBe('AVAILABLE');
      expect(res.body.data.purchaseCost).toBe(25000000);
      expect(res.body.data.category.code).toBe('LAPTOP');
    });

    it('returns 409 ASSET_CODE_TAKEN on duplicate assetCode within the tenant', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ categoryId: laptopCatId, assetCode: 'LP-001', name: 'Dupe' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_CODE_TAKEN');
    });

    it('returns 422 on missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'No category or code' });
      expect(res.status).toBe(422);
    });

    it('returns 404 when categoryId belongs to another tenant', async () => {
      const foreignCat = await db.assetCategory.findFirst({ where: { tenantId: otherTenantId } });
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ categoryId: foreignCat!.id, assetCode: 'LP-300', name: 'Cross-tenant cat' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /assets/:id', () => {
    it('updates editable fields', async () => {
      const asset = await db.asset.findFirst({ where: { tenantId, assetCode: 'MS-001' } });
      const res = await request(app)
        .patch(`/api/v1/assets/${asset!.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Logitech MX Master 3S', location: 'HCM Office' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Logitech MX Master 3S');
      expect(res.body.data.location).toBe('HCM Office');
    });

    it('returns 404 for an asset in another tenant', async () => {
      const res = await request(app)
        .patch(`/api/v1/assets/${foreignAssetId}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /assets/:id', () => {
    it('deletes an asset that has no history', async () => {
      const asset = await db.asset.create({
        data: { tenantId, categoryId: laptopCatId, assetCode: 'LP-DEL', name: 'Disposable' },
      });
      const res = await request(app)
        .delete(`/api/v1/assets/${asset.id}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      const gone = await db.asset.findUnique({ where: { id: asset.id } });
      expect(gone).toBeNull();
    });

    it('returns 409 ASSET_HAS_HISTORY when assignment history exists', async () => {
      const asset = await db.asset.create({
        data: { tenantId, categoryId: laptopCatId, assetCode: 'LP-HIST', name: 'Has history', status: 'ASSIGNED' },
      });
      await db.assetAssignment.create({
        data: {
          tenantId,
          assetId: asset.id,
          employeeId: holderId,
          assignedById: holderId,
          assignedAt: new Date(),
          status: 'ACTIVE',
        },
      });
      const res = await request(app)
        .delete(`/api/v1/assets/${asset.id}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_HAS_HISTORY');
    });
  });
});
