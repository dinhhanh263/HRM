import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// Asset maintenance + disposal lifecycle:
//   POST /assets/:id/maintenance          → assets:maintain; start, AVAILABLE→UNDER_MAINTENANCE (409 otherwise)
//   POST /assets/:id/maintenance/complete → assets:maintain; close open record, UNDER_MAINTENANCE→AVAILABLE
//   POST /assets/:id/dispose              → assets:dispose; terminal RETIRED/LOST (409 if ASSIGNED or already terminal)
// Invariants: an asset under maintenance has exactly one open maintenance record;
// disposal is terminal and irreversible.
const TENANT_SLUG = 'asset-maint-tenant';
const OTHER_SLUG = 'asset-maint-other';
const HR_EMAIL = 'hr@maint.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@maint.com';
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

describe('Asset maintenance & disposal routes', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let categoryId: string;
  let hrEmployeeId: string;
  let empEmployeeId: string;
  let foreignAssetId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Asset Maint Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Asset Maint Other', slug: OTHER_SLUG },
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

    const category = await db.assetCategory.create({
      data: { tenantId, name: 'Laptops', code: 'LAPTOP' },
    });
    categoryId = category.id;

    const hrEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'EMP-HR',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    hrEmployeeId = hrEmployee.id;

    const empEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: empUser.id,
        employeeCode: 'EMP-001',
        fullName: 'Plain Employee',
        joinDate: new Date('2024-02-01'),
        contractType: 'FULL_TIME',
      },
    });
    empEmployeeId = empEmployee.id;

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

  beforeEach(async () => {
    await db.assetMaintenance.deleteMany({ where: { tenantId } });
    await db.assetAssignment.deleteMany({ where: { tenantId } });
    await db.asset.deleteMany({ where: { tenantId } });
  });

  async function createAsset(
    code: string,
    status: 'AVAILABLE' | 'ASSIGNED' | 'UNDER_MAINTENANCE' | 'RETIRED' | 'LOST' = 'AVAILABLE',
  ) {
    return db.asset.create({
      data: { tenantId, categoryId, assetCode: code, name: `Asset ${code}`, status },
    });
  }

  describe('POST /assets/:id/maintenance (start)', () => {
    it('starts maintenance on an AVAILABLE asset and flips status to UNDER_MAINTENANCE', async () => {
      const asset = await createAsset('LP-MAINT');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01', description: 'Thay pin', vendor: 'TechFix', cost: 1500000 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_MAINTENANCE');
      expect(res.body.data.maintenances).toHaveLength(1);
      expect(res.body.data.maintenances[0].completedAt).toBeNull();
      expect(res.body.data.maintenances[0].cost).toBe(1500000);
      expect(res.body.data.maintenances[0].createdById).toBe(hrEmployeeId);

      const fresh = await db.asset.findUnique({ where: { id: asset.id } });
      expect(fresh!.status).toBe('UNDER_MAINTENANCE');
    });

    it('returns 409 when the asset is ASSIGNED (must be returned first)', async () => {
      const asset = await createAsset('LP-MAINT-ASSIGNED', 'ASSIGNED');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01', description: 'Sửa' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_MAINTAINABLE');
    });

    it('returns 403 for EMPLOYEE (lacks assets:maintain)', async () => {
      const asset = await createAsset('LP-MAINT-403');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ startedAt: '2026-06-01', description: 'Sửa' });
      expect(res.status).toBe(403);
    });

    it('returns 422 when description is missing', async () => {
      const asset = await createAsset('LP-MAINT-422');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01' });
      expect(res.status).toBe(422);
    });

    it('returns 404 for an asset in another tenant', async () => {
      const res = await request(app)
        .post(`/api/v1/assets/${foreignAssetId}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01', description: 'Sửa' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /assets/:id/maintenance/complete', () => {
    it('completes the open maintenance and flips status back to AVAILABLE', async () => {
      const asset = await createAsset('LP-DONE');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01', description: 'Thay pin' });

      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance/complete`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ completedAt: '2026-06-05', cost: 2000000 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AVAILABLE');
      expect(res.body.data.maintenances).toHaveLength(1);
      expect(res.body.data.maintenances[0].completedAt).not.toBeNull();
      expect(res.body.data.maintenances[0].cost).toBe(2000000);

      const open = await db.assetMaintenance.count({
        where: { assetId: asset.id, completedAt: null },
      });
      expect(open).toBe(0);
    });

    it('returns 409 when the asset is not UNDER_MAINTENANCE', async () => {
      const asset = await createAsset('LP-NOMAINT');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance/complete`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ completedAt: '2026-06-05' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_UNDER_MAINTENANCE');
    });

    it('allows starting a new maintenance after completing one (full cycle)', async () => {
      const asset = await createAsset('LP-MCYCLE');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-01', description: 'Lần 1' });
      await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance/complete`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ completedAt: '2026-06-03' });
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/maintenance`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ startedAt: '2026-06-10', description: 'Lần 2' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_MAINTENANCE');
      const all = await db.assetMaintenance.findMany({ where: { assetId: asset.id } });
      expect(all).toHaveLength(2);
    });
  });

  describe('POST /assets/:id/dispose', () => {
    it('disposes an AVAILABLE asset as RETIRED (terminal) with reason', async () => {
      const asset = await createAsset('LP-RETIRE');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'RETIRED', reason: 'Hết khấu hao', retiredAt: '2026-06-01' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RETIRED');
      expect(res.body.data.retirementReason).toBe('Hết khấu hao');
      expect(res.body.data.retiredAt).not.toBeNull();
      expect(res.body.data.retiredById).toBe(hrEmployeeId);
    });

    it('disposes an UNDER_MAINTENANCE asset as LOST', async () => {
      const asset = await createAsset('LP-LOST', 'UNDER_MAINTENANCE');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'LOST', reason: 'Mất khi sửa', retiredAt: '2026-06-01' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('LOST');
    });

    it('returns 409 when disposing an ASSIGNED asset (must return first)', async () => {
      const asset = await createAsset('LP-DISP-ASSIGNED', 'ASSIGNED');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'RETIRED', reason: 'x', retiredAt: '2026-06-01' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_DISPOSABLE');
    });

    it('returns 409 when the asset is already disposed (terminal)', async () => {
      const asset = await createAsset('LP-ALREADY', 'RETIRED');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'LOST', reason: 'x', retiredAt: '2026-06-01' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_ALREADY_DISPOSED');
    });

    it('returns 422 for an invalid target status (not RETIRED/LOST)', async () => {
      const asset = await createAsset('LP-DISP-422');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'AVAILABLE', reason: 'x', retiredAt: '2026-06-01' });
      expect(res.status).toBe(422);
    });

    it('returns 403 for EMPLOYEE (lacks assets:dispose)', async () => {
      const asset = await createAsset('LP-DISP-403');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/dispose`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ status: 'RETIRED', reason: 'x', retiredAt: '2026-06-01' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for an asset in another tenant', async () => {
      const res = await request(app)
        .post(`/api/v1/assets/${foreignAssetId}/dispose`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'RETIRED', reason: 'x', retiredAt: '2026-06-01' });
      expect(res.status).toBe(404);
    });
  });
});
