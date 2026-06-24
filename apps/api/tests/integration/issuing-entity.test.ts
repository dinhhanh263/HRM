import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-043: IssuingEntity CRUD — tenant-scoped, settings-permission-driven:
//   GET    /issuing-entities         → settings:view   (HR_MANAGER, SUPER_ADMIN)
//   POST   /issuing-entities         → settings:update
//   PATCH  /issuing-entities/:id     → settings:update  (set default / hide)
//   DELETE /issuing-entities/:id     → settings:update  (soft-hide active=false)
//   *      /logo                     → upload/serve/clear (PNG/JPEG only)
// Invariants under test: only ONE isDefault per tenant; EMPLOYEE is denied;
// cross-tenant ids are invisible (404).
const SLUG = 'issuing-it-tenant';
const OTHER_SLUG = 'issuing-it-other';
const HR = { email: 'hr@issuing.com', password: 'HrTest@123' };
const EMP = { email: 'emp@issuing.com', password: 'EmpTest@123' };
const OTHER_HR = { email: 'hr@issuing-other.com', password: 'OtherHr@123' };

async function cleanup(tenantId: string) {
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: slug });
  if (!res.body?.data?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

// A tiny valid 1x1 PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

describe('IssuingEntity routes (RBAC + single-default + tenant scope + logo)', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let otherHrToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Issuing IT', slug: SLUG } });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({ where: { slug: OTHER_SLUG }, update: {}, create: { name: 'Issuing Other', slug: OTHER_SLUG } });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIds = await syncSystemRolesForTenant(db, otherTenantId);

    await db.user.create({
      data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' },
    });
    await db.user.create({
      data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'Emp', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' },
    });
    await db.user.create({
      data: { tenantId: otherTenantId, email: OTHER_HR.email, passwordHash: await hashPassword(OTHER_HR.password), fullName: 'Other HR', role: 'HR_MANAGER', roleId: otherRoleIds.get('hr_manager'), status: 'ACTIVE' },
    });

    hrToken = await login(HR.email, HR.password, SLUG);
    empToken = await login(EMP.email, EMP.password, SLUG);
    otherHrToken = await login(OTHER_HR.email, OTHER_HR.password, OTHER_SLUG);
  });

  it('denies EMPLOYEE from listing or creating (settings perms)', async () => {
    const list = await request(app).get('/api/v1/issuing-entities').set('Authorization', `Bearer ${empToken}`);
    expect(list.status).toBe(403);
    const create = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ name: 'X' });
    expect(create.status).toBe(403);
  });

  it('creates an entity (name required) and lists it', async () => {
    const created = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'CodeCrush Asia JSC', taxCode: '0312345678', isDefault: true });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('CodeCrush Asia JSC');
    expect(created.body.data.isDefault).toBe(true);

    const missingName = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: '   ' });
    expect(missingName.status).toBe(422);
  });

  it('keeps exactly one default per tenant across create + update', async () => {
    // Second default-create flips the first one off.
    const second = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Hale', isDefault: true });
    expect(second.status).toBe(201);

    let defaults = await db.issuingEntity.count({ where: { tenantId, isDefault: true } });
    expect(defaults).toBe(1);

    // Promote a third via PATCH → still exactly one.
    const third = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Third Co' });
    await request(app)
      .patch(`/api/v1/issuing-entities/${third.body.data.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isDefault: true })
      .expect(200);

    defaults = await db.issuingEntity.count({ where: { tenantId, isDefault: true } });
    expect(defaults).toBe(1);
    const remaining = await db.issuingEntity.findFirst({ where: { tenantId, isDefault: true } });
    expect(remaining?.name).toBe('Third Co');
  });

  it('soft-hides on DELETE (active=false), excluded from activeOnly list', async () => {
    const created = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'To Hide' });
    const id = created.body.data.id;

    await request(app)
      .delete(`/api/v1/issuing-entities/${id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(204);

    const row = await db.issuingEntity.findUnique({ where: { id } });
    expect(row?.active).toBe(false); // still present (snapshot-safe), just hidden

    const activeOnly = await request(app)
      .get('/api/v1/issuing-entities?activeOnly=1')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(activeOnly.body.data.some((e: { id: string }) => e.id === id)).toBe(false);

    const all = await request(app).get('/api/v1/issuing-entities').set('Authorization', `Bearer ${hrToken}`);
    expect(all.body.data.some((e: { id: string }) => e.id === id)).toBe(true);
  });

  it('cannot read/patch another tenant entity (404)', async () => {
    const mine = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Mine' });
    const id = mine.body.data.id;

    const patch = await request(app)
      .patch(`/api/v1/issuing-entities/${id}`)
      .set('Authorization', `Bearer ${otherHrToken}`)
      .send({ name: 'Hijack' });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/v1/issuing-entities/${id}`)
      .set('Authorization', `Bearer ${otherHrToken}`);
    expect(del.status).toBe(404);
  });

  it('uploads, serves, and clears a PNG logo', async () => {
    const created = await request(app)
      .post('/api/v1/issuing-entities')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Logo Co' });
    const id = created.body.data.id;

    const up = await request(app)
      .post(`/api/v1/issuing-entities/${id}/logo`)
      .set('Authorization', `Bearer ${hrToken}`)
      .attach('file', PNG_1x1, { filename: 'logo.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.data.logoUrl).toMatch(/^\/uploads\/entity-logo\//);

    const serve = await request(app)
      .get(`/api/v1/issuing-entities/${id}/logo`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(serve.status).toBe(200);
    expect(serve.headers['content-type']).toContain('image/png');

    // Reject a non-image upload.
    const bad = await request(app)
      .post(`/api/v1/issuing-entities/${id}/logo`)
      .set('Authorization', `Bearer ${hrToken}`)
      .attach('file', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);

    const clear = await request(app)
      .delete(`/api/v1/issuing-entities/${id}/logo`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(clear.status).toBe(200);
    expect(clear.body.data.logoUrl).toBeNull();

    const gone = await request(app)
      .get(`/api/v1/issuing-entities/${id}/logo`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(gone.status).toBe(404);
  });
});
