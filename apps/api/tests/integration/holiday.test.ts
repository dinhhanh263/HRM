import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// The VN statutory-holiday seed endpoint: only roles with timesheet:configure
// (HR/super) may bulk-populate a year; the operation must be idempotent so HR
// can safely re-run it; everyone else is forbidden.
const TENANT_SLUG = 'holiday-seed-tenant';
const HR_EMAIL = 'hr@holiday-seed.com';
const HR_PASSWORD = 'HrSeed@12345';
const EMP_EMAIL = 'emp@holiday-seed.com';
const EMP_PASSWORD = 'EmpSeed@12345';
const SEED_YEAR = 2026;
// A far-future year deliberately absent from the lunar table, so seeding it
// yields only the 5 solar holidays and must flag the missing Tết data.
const UNCOVERED_YEAR = 2099;

async function cleanup(tenantId: string) {
  await db.holiday.deleteMany({ where: { tenantId } });
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

describe('Holiday seed endpoint (POST /timesheet/holidays/seed)', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Holiday Seed Tenant', slug: TENANT_SLUG },
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

    // Plain employee: holds timesheet:view + timesheet:create, NOT :configure.
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

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('seeds the standard VN holidays for a year and lists them', async () => {
    const seedRes = await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: SEED_YEAR });

    expect(seedRes.status).toBe(200);
    expect(seedRes.body.data.year).toBe(SEED_YEAR);
    expect(seedRes.body.data.seeded).toBeGreaterThan(0);

    const listRes = await request(app)
      .get(`/api/v1/timesheet/holidays?year=${SEED_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(listRes.status).toBe(200);
    const dates = listRes.body.data.map((h: { date: string }) => h.date);
    // National Day (Quốc khánh) is the canonical fixed statutory holiday.
    expect(dates).toContain(`${SEED_YEAR}-09-02`);
    expect(listRes.body.data).toHaveLength(seedRes.body.data.seeded);
  });

  it('includes Tết and flags lunarCovered for a year with lunar data', async () => {
    const seedRes = await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: SEED_YEAR });

    expect(seedRes.status).toBe(200);
    expect(seedRes.body.data.lunarCovered).toBe(true);

    const listRes = await request(app)
      .get(`/api/v1/timesheet/holidays?year=${SEED_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`);

    const dates = listRes.body.data.map((h: { date: string }) => h.date);
    // Mùng 1 Tết 2026 — the most important holiday, must be present.
    expect(dates).toContain('2026-02-17');
    // Giỗ Tổ Hùng Vương 2026.
    expect(dates).toContain('2026-04-26');
    // 5 solar + 6 lunar entries.
    expect(seedRes.body.data.seeded).toBe(11);
  });

  it('signals the gap when seeding a year without lunar data', async () => {
    const seedRes = await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: UNCOVERED_YEAR });

    expect(seedRes.status).toBe(200);
    expect(seedRes.body.data.lunarCovered).toBe(false);
    // Only the 5 solar-fixed holidays — no Tết.
    expect(seedRes.body.data.seeded).toBe(5);

    const listRes = await request(app)
      .get(`/api/v1/timesheet/holidays?year=${UNCOVERED_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`);
    const names = listRes.body.data.map((h: { name: string }) => h.name);
    // No Tết Nguyên đán (lunar) — "Tết Dương lịch" (solar Jan 1) is still present.
    expect(names.some((n: string) => n.includes('Tết Nguyên đán'))).toBe(false);
  });

  it('is idempotent — re-seeding the same year does not duplicate', async () => {
    const before = await request(app)
      .get(`/api/v1/timesheet/holidays?year=${SEED_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`);

    await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: SEED_YEAR })
      .expect(200);

    const after = await request(app)
      .get(`/api/v1/timesheet/holidays?year=${SEED_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(after.body.data).toHaveLength(before.body.data.length);
  });

  it('re-seeding restores the canonical name of an edited holiday', async () => {
    // HR accidentally renames National Day; re-seeding must overwrite it back
    // to the statutory name (the seed dialog promises this repair behavior).
    const nationalDay = await db.holiday.findFirst({
      where: { tenantId, date: new Date(`${SEED_YEAR}-09-02T00:00:00.000Z`) },
    });
    expect(nationalDay).not.toBeNull();
    await db.holiday.update({
      where: { id: nationalDay!.id },
      data: { name: 'Tên sai do gõ nhầm' },
    });

    await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: SEED_YEAR })
      .expect(200);

    const restored = await db.holiday.findUnique({ where: { id: nationalDay!.id } });
    expect(restored?.name).toBe('Quốc khánh');
  });

  it('forbids a plain employee from seeding', async () => {
    const res = await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ year: SEED_YEAR });

    expect(res.status).toBe(403);
  });

  it('rejects an invalid year with 422', async () => {
    const res = await request(app)
      .post('/api/v1/timesheet/holidays/seed')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ year: 'not-a-year' });

    expect(res.status).toBe(422);
  });
});
