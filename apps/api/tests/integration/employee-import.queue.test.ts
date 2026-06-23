import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Worker } from 'bullmq';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { createImportWorker } from '../../src/domain/employee-import/employee-import.worker.js';
import { getImportQueue } from '../../src/domain/employee-import/employee-import.queue.js';

const TENANT_SLUG = 'import-queue-tenant';
const HR_EMAIL = 'hr@import-queue.com';
const HR_PASSWORD = 'HrQueue@123';
const EMP_EMAIL = 'emp@import-queue.com';
const EMP_PASSWORD = 'EmpQueue@123';

// A second, unrelated tenant whose HR user also holds employees:import — used to
// prove one tenant cannot read another's import job by guessing its (integer) id.
const TENANT_B_SLUG = 'import-queue-tenant-b';
const HR_B_EMAIL = 'hr@import-queue-b.com';
const HR_B_PASSWORD = 'HrQueueB@123';

const CANONICAL_HEADERS = [
  'employeeCode', 'fullName', 'email', 'dateOfBirth', 'gender', 'idNumber', 'phone',
  'department', 'position', 'manager', 'joinDate', 'contractType', 'role',
];

function makeCsv(dataRows: string[][]): Buffer {
  const lines = [CANONICAL_HEADERS.join(','), ...dataRows.map((r) => r.join(','))];
  return Buffer.from(lines.join('\n'), 'utf-8');
}
function row(fields: Partial<Record<string, string>>): string[] {
  // Employee code is required; derive a unique one from the email local-part
  // when a test doesn't set it explicitly.
  const withCode: Partial<Record<string, string>> = {
    ...fields,
    employeeCode: fields.employeeCode ?? (fields.email ? `NV-${fields.email.split('@')[0]}` : ''),
  };
  return CANONICAL_HEADERS.map((h) => withCode[h] ?? '');
}

/** Poll the status endpoint until the job finishes (or a timeout elapses). */
async function waitForJob(token: string, jobId: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await request(app)
      .get(`/api/v1/employees/import/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    const state = res.body?.data?.state;
    if (state === 'completed' || state === 'failed') return res.body.data;
    if (Date.now() > deadline) throw new Error(`Job ${jobId} did not finish; last state=${state}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Employee Import API — POST /employees/import + GET /:jobId (queue + worker)', () => {
  let tenantId: string;
  let tenantBId: string;
  let hrToken: string;
  let hrTokenB: string;
  let empToken: string;
  let worker: Worker;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Import Queue Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.employee.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.position.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId, email: HR_EMAIL, passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager', role: 'HR_MANAGER', roleId: roleIdByKey.get('hr_manager'), status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId, email: EMP_EMAIL, passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Plain Employee', role: 'EMPLOYEE', roleId: roleIdByKey.get('employee'), status: 'ACTIVE',
      },
    });

    // Second tenant with its own HR user (also holds employees:import).
    const tenantB = await db.tenant.upsert({
      where: { slug: TENANT_B_SLUG },
      update: {},
      create: { name: 'Import Queue Tenant B', slug: TENANT_B_SLUG },
    });
    tenantBId = tenantB.id;
    await db.user.deleteMany({ where: { tenantId: tenantBId } });
    const roleIdByKeyB = await syncSystemRolesForTenant(db, tenantBId);
    await db.user.create({
      data: {
        tenantId: tenantBId, email: HR_B_EMAIL, passwordHash: await hashPassword(HR_B_PASSWORD),
        fullName: 'HR Manager B', role: 'HR_MANAGER', roleId: roleIdByKeyB.get('hr_manager'), status: 'ACTIVE',
      },
    });

    hrToken = (
      await request(app).post('/api/v1/auth/login')
        .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG })
    ).body.data.accessToken;
    hrTokenB = (
      await request(app).post('/api/v1/auth/login')
        .send({ email: HR_B_EMAIL, password: HR_B_PASSWORD, tenantSlug: TENANT_B_SLUG })
    ).body.data.accessToken;
    empToken = (
      await request(app).post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG })
    ).body.data.accessToken;

    // Clean any stale jobs, then start the in-process worker.
    await getImportQueue().obliterate({ force: true });
    worker = createImportWorker();
  });

  afterAll(async () => {
    await worker.close();
    await getImportQueue().close();
    await db.employee.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.position.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId: tenantBId } });
    await db.tenant.deleteMany({ where: { slug: { in: [TENANT_SLUG, TENANT_B_SLUG] } } });
    await redis.quit();
  });

  /** Validate a clean 2-row file and return its staging importId. */
  async function stageTwoRows(): Promise<string> {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .field('autoCreateOrgUnits', 'true')
      .attach('file', makeCsv([
        row({ fullName: 'Queue One', email: 'q1@import-queue.com', department: 'Ops' }),
        row({ fullName: 'Queue Two', email: 'q2@import-queue.com', manager: 'q1@import-queue.com' }),
      ]), 'employees.csv');
    expect(res.body.data.validCount).toBe(2);
    return res.body.data.importId;
  }

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/v1/employees/import').send({ importId: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user lacking employees:import', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ importId: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown / expired importId', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId: 'does-not-exist' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('IMPORT_STAGING_NOT_FOUND');
  });

  it('enqueues a staged import and the worker creates the employees', async () => {
    const importId = await stageTwoRows();

    const enqueueRes = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });

    expect(enqueueRes.status).toBe(202);
    const jobId = enqueueRes.body.data.jobId;
    expect(typeof jobId).toBe('string');

    const final = await waitForJob(hrToken, jobId);
    expect(final.state).toBe('completed');
    expect(final.result).toMatchObject({ total: 2, created: 2, skipped: 0, failed: 0 });

    // Persisted: 2 INVITED users + employees, with the manager linked.
    const users = await db.user.findMany({
      where: { tenantId, email: { in: ['q1@import-queue.com', 'q2@import-queue.com'] } },
    });
    expect(users).toHaveLength(2);
    expect(users.every((u) => u.status === 'INVITED')).toBe(true);

    const two = await db.employee.findFirst({
      where: { tenantId, user: { email: 'q2@import-queue.com' } },
    });
    const one = await db.employee.findFirst({
      where: { tenantId, user: { email: 'q1@import-queue.com' } },
    });
    expect(two?.managerId).toBe(one?.id);

    // Staging entry is consumed after the worker finishes.
    const reuse = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });
    expect(reuse.status).toBe(404);
  });

  it('returns 404 from the status endpoint for an unknown jobId', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/999999')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(404);
  });

  it('does not leak another tenant\'s import job (tenant isolation on status)', async () => {
    // Tenant A enqueues a real job under a fresh email (unique so validate passes
    // regardless of rows created by earlier tests).
    const stageRes = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${hrToken}`)
      .field('autoCreateOrgUnits', 'true')
      .attach('file', makeCsv([
        row({ fullName: 'Isolation One', email: 'iso1@import-queue.com', department: 'Ops' }),
      ]), 'employees.csv');
    expect(stageRes.body.data.validCount).toBe(1);
    const importId = stageRes.body.data.importId;

    const enqueueRes = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ importId });
    const jobId = enqueueRes.body.data.jobId;
    await waitForJob(hrToken, jobId);

    // Tenant B holds employees:import in its own tenant, yet must NOT be able to
    // read tenant A's job by id — otherwise integer ids leak cross-tenant PII.
    const leak = await request(app)
      .get(`/api/v1/employees/import/${jobId}`)
      .set('Authorization', `Bearer ${hrTokenB}`);
    expect(leak.status).toBe(404);

    // The owning tenant can still read it.
    const owner = await request(app)
      .get(`/api/v1/employees/import/${jobId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(owner.status).toBe(200);
    expect(owner.body.data.jobId).toBe(jobId);
  });
});
