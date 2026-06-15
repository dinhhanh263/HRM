import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { ASSET_IMPORT_ERROR_CODES, ASSET_IMPORT_COLUMNS } from '@hrm/shared';

// Bulk asset import — RBAC + validate (dry-run, no writes) + confirm (atomic).
//   POST /assets/import/validate → assets:import (HR); stages a clean file
//   POST /assets/import          → assets:import; all-or-nothing $transaction
const TENANT_SLUG = 'asset-import-tenant';
const OTHER_SLUG = 'asset-import-other';
const HR_EMAIL = 'hr@asset-import.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@asset-import.com';
const EMP_PASSWORD = 'EmpTest@123';
const OTHER_HR_EMAIL = 'hr@asset-import-other.com';
const OTHER_HR_PASSWORD = 'OtherHr@123';

/** Build a CSV buffer from row objects keyed by canonical asset-import column. */
function makeCsv(rows: Partial<Record<string, string>>[]): Buffer {
  const header = ASSET_IMPORT_COLUMNS.join(',');
  const lines = rows.map((r) => ASSET_IMPORT_COLUMNS.map((c) => r[c] ?? '').join(','));
  return Buffer.from([header, ...lines].join('\n'), 'utf-8');
}

async function login(email: string, password: string, slug: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: slug });
  return res.body.data.accessToken;
}

async function cleanup(tenantId: string) {
  await db.assetAssignment.deleteMany({ where: { tenantId } });
  await db.asset.deleteMany({ where: { tenantId } });
  await db.assetCategory.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Asset Import API', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let otherHrToken: string;
  let laptopCatId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Asset Import Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Asset Import Other', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIdByKey = await syncSystemRolesForTenant(db, otherTenantId);

    // HR user — has assets:import. Linked to an employee so owner-row imports can
    // record a handover (assignedById → this employee).
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
    await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'EMP-HR',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    // Plain employee — lacks assets:import (403 gate).
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
    // An ACTIVE employee that owner rows reference (by employee code AND email).
    await db.user.create({
      data: {
        tenantId,
        email: 'owner@asset-import.com',
        passwordHash: await hashPassword('Owner@123'),
        fullName: 'Asset Owner',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const ownerUser = await db.user.findFirstOrThrow({
      where: { tenantId, email: 'owner@asset-import.com' },
    });
    await db.employee.create({
      data: {
        tenantId,
        userId: ownerUser.id,
        employeeCode: 'EMP-OWNER',
        fullName: 'Asset Owner',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });

    // Other-tenant HR (for cross-tenant staging isolation).
    await db.user.create({
      data: {
        tenantId: otherTenantId,
        email: OTHER_HR_EMAIL,
        passwordHash: await hashPassword(OTHER_HR_PASSWORD),
        fullName: 'Other HR',
        role: 'HR_MANAGER',
        roleId: otherRoleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    const cat = await db.assetCategory.create({
      data: { tenantId, name: 'Laptops', code: 'LAPTOP' },
    });
    laptopCatId = cat.id;

    hrToken = await login(HR_EMAIL, HR_PASSWORD, TENANT_SLUG);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD, TENANT_SLUG);
    otherHrToken = await login(OTHER_HR_EMAIL, OTHER_HR_PASSWORD, OTHER_SLUG);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.tenant.deleteMany({ where: { slug: { in: [TENANT_SLUG, OTHER_SLUG] } } });
    await redis.quit();
  });

  // ── RBAC ────────────────────────────────────────────────────────────────
  it('returns 401 without authentication (validate + import)', async () => {
    expect((await request(app).post('/api/v1/assets/import/validate')).status).toBe(401);
    expect((await request(app).post('/api/v1/assets/import').send({ importId: 'x' })).status).toBe(401);
  });

  it('returns 403 for a user lacking assets:import (EMPLOYEE)', async () => {
    const v = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${empToken}`)
      .attach('file', makeCsv([{ assetCode: 'LP-1', name: 'A', category: 'LAPTOP' }]), 'a.csv');
    expect(v.status).toBe(403);

    const c = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ importId: 'whatever' });
    expect(c.status).toBe(403);
  });

  // ── Validate (dry-run) ────────────────────────────────────────────────────
  it('validates a clean file, stages an importId, and writes nothing', async () => {
    const before = await db.asset.count({ where: { tenantId } });
    const res = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach(
        'file',
        makeCsv([
          { assetCode: 'CLEAN-1', name: 'MacBook', category: 'LAPTOP' },
          { assetCode: 'CLEAN-2', name: 'Dell', category: 'LAPTOP', condition: 'good', purchaseCost: '15000000' },
        ]),
        'assets.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.validCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
    expect(typeof res.body.data.importId).toBe('string');
    expect(await db.asset.count({ where: { tenantId } })).toBe(before);
  });

  it('flags CATEGORY_NOT_FOUND, OWNER_NOT_FOUND, and in-file duplicate; no importId', async () => {
    const res = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach(
        'file',
        makeCsv([
          { assetCode: 'DUP-1', name: 'Has bad category', category: 'NOPE' },
          { assetCode: 'DUP-1', name: 'Duplicate code', category: 'LAPTOP' },
          { assetCode: 'OWN-1', name: 'Bad owner', category: 'LAPTOP', owner: 'ghost@x.com', assignedAt: '2024-03-01' },
        ]),
        'assets.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.importId).toBeNull();
    const codes = res.body.data.rows.flatMap((r: { errors: { code: string }[] }) =>
      r.errors.map((e) => e.code),
    );
    expect(codes).toContain(ASSET_IMPORT_ERROR_CODES.CATEGORY_NOT_FOUND);
    expect(codes).toContain(ASSET_IMPORT_ERROR_CODES.OWNER_NOT_FOUND);
    expect(codes).toContain(ASSET_IMPORT_ERROR_CODES.ASSET_CODE_DUPLICATE_IN_FILE);
  });

  // ── Confirm (atomic) ──────────────────────────────────────────────────────
  it('commits a clean import atomically: assets + owner handover; staging consumed', async () => {
    const validate = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach(
        'file',
        makeCsv([
          { assetCode: 'OK-1', name: 'Unassigned', category: 'LAPTOP' },
          { assetCode: 'OK-2', name: 'Owned by code', category: 'LAPTOP', owner: 'EMP-OWNER', assignedAt: '2024-03-01' },
          { assetCode: 'OK-3', name: 'Owned by email', category: 'LAPTOP', owner: 'owner@asset-import.com', assignedAt: '2024-03-02' },
        ]),
        'assets.csv',
      );
    const importId = validate.body.data.importId as string;
    expect(typeof importId).toBe('string');

    const res = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ created: 3, assignmentsCreated: 2 });

    const ok1 = await db.asset.findFirst({ where: { tenantId, assetCode: 'OK-1' } });
    const ok2 = await db.asset.findFirst({
      where: { tenantId, assetCode: 'OK-2' },
      include: { assignments: true },
    });
    expect(ok1?.status).toBe('AVAILABLE');
    expect(ok2?.status).toBe('ASSIGNED');
    expect(ok2?.assignments).toHaveLength(1);
    expect(ok2?.assignments[0].status).toBe('ACTIVE');
    expect(ok2?.assignments[0].ackStatus).toBe('PENDING');

    // Staging is consumed — a replay returns 404.
    const replay = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });
    expect(replay.status).toBe(404);
    expect(replay.body.error.code).toBe(ASSET_IMPORT_ERROR_CODES.STAGING_NOT_FOUND);
  });

  it('rolls back the whole batch when an assetCode is taken after validate (race)', async () => {
    const validate = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach(
        'file',
        makeCsv([
          { assetCode: 'RACE-A', name: 'First', category: 'LAPTOP' },
          { assetCode: 'RACE-B', name: 'Collides', category: 'LAPTOP' },
        ]),
        'assets.csv',
      );
    const importId = validate.body.data.importId as string;

    // Someone creates RACE-B between validate and confirm.
    await db.asset.create({
      data: { tenantId, categoryId: laptopCatId, assetCode: 'RACE-B', name: 'Sneaked in', status: 'AVAILABLE' },
    });

    const res = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });

    expect(res.status).toBe(409);
    // All-or-nothing: RACE-A must NOT have been created.
    expect(await db.asset.findFirst({ where: { tenantId, assetCode: 'RACE-A' } })).toBeNull();
  });

  it('refuses to confirm another tenant’s staged import (404, isolation)', async () => {
    const validate = await request(app)
      .post('/api/v1/assets/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach('file', makeCsv([{ assetCode: 'ISO-1', name: 'Isolated', category: 'LAPTOP' }]), 'assets.csv');
    const importId = validate.body.data.importId as string;

    const res = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${otherHrToken}`)
      .send({ importId });
    expect(res.status).toBe(404);
    // The legitimate tenant's asset was never created by the foreign attempt.
    expect(await db.asset.findFirst({ where: { tenantId: otherTenantId, assetCode: 'ISO-1' } })).toBeNull();
  });

  it('returns 400 when importId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/assets/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
