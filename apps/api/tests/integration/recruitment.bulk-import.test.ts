import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import PDFDocument from 'pdfkit';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { getCvParseQueue } from '../../src/domain/recruitment/cv-parse.queue.js';

const TENANT_SLUG = 'recruitment-bulk-tenant';
const HR_EMAIL = 'hr@recruitment-bulk.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-bulk.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' as const },
  { name: 'Sàng lọc', order: 1, type: 'SCREEN' as const },
  { name: 'Đã tuyển', order: 2, type: 'HIRED' as const },
  { name: 'Từ chối', order: 3, type: 'REJECTED' as const },
];

function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
}

async function cleanup(tenantId: string) {
  await db.bulkImportBatch.deleteMany({ where: { tenantId } });
  // Candidate delete cascades its applications + attachments.
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.job.deleteMany({ where: { tenantId } });
  await db.pipelineTemplate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Recruitment API — bulk CV intake (upload)', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let jobId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Bulk Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

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
    // Job ownership requires the creator to have an Employee profile.
    await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'HR-001',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });

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

    const template = await db.pipelineTemplate.create({
      data: { tenantId, name: 'Quy trình test', isDefault: true, stages: { create: validStages } },
    });

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;

    const job = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set(auth(hrToken))
      .send({ title: 'Backend Developer', pipelineTemplateId: template.id, status: 'OPEN' });
    jobId = job.body.data.id;
  });

  afterAll(async () => {
    // Upload enqueues per-item parse jobs; close the lazily-opened queue + Redis
    // so the process exits. No worker runs here, so jobs stay queued.
    await getCvParseQueue().close();
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await redis.quit();
  });

  it('creates a batch with one item per uploaded CV, each PARSING/PENDING', async () => {
    const [a, b] = await Promise.all([
      makePdf('CV A — Nguyen Van A, Node.js'),
      makePdf('CV B — Tran Thi B, React'),
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/jobs/${jobId}/bulk-import`)
      .set(auth(hrToken))
      .attach('files', a, 'cv-a.pdf')
      .attach('files', b, 'cv-b.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe(jobId);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.items).toHaveLength(2);

    const fileNames = res.body.data.items.map((i: { fileName: string }) => i.fileName).sort();
    expect(fileNames).toEqual(['cv-a.pdf', 'cv-b.pdf']);

    for (const item of res.body.data.items) {
      expect(item.status).toBe('PARSING');
      expect(item.parseStatus).toBe('PENDING');
      expect(item.resolution).toBe('NEW');
      expect(item.parsed).toBeNull();
      expect(item.candidateId).toBeNull();
    }

    // Persisted: the batch + items survive the request.
    const persisted = await db.bulkImportBatch.findUnique({
      where: { id: res.body.data.id },
      include: { items: true },
    });
    expect(persisted?.items).toHaveLength(2);
  });

  it('rejects a request with no files (400 BULK_IMPORT_NO_FILES)', async () => {
    const res = await request(app)
      .post(`/api/v1/recruitment/jobs/${jobId}/bulk-import`)
      .set(auth(hrToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BULK_IMPORT_NO_FILES');
  });

  it('rejects an unsupported file type with 400 CV_UNSUPPORTED_TYPE', async () => {
    const res = await request(app)
      .post(`/api/v1/recruitment/jobs/${jobId}/bulk-import`)
      .set(auth(hrToken))
      .attach('files', Buffer.from('plain text resume'), {
        filename: 'cv.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CV_UNSUPPORTED_TYPE');
  });

  it('returns 404 for a job in another/unknown scope', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/jobs/c-non-existent-job/bulk-import')
      .set(auth(hrToken))
      .attach('files', await makePdf('CV X'), 'cv-x.pdf');

    expect(res.status).toBe(404);
  });

  it('rejects a user without recruitment:bulk_import (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/recruitment/jobs/${jobId}/bulk-import`)
      .set(auth(noAccessToken))
      .attach('files', await makePdf('CV blocked'), 'blocked.pdf');

    expect(res.status).toBe(403);
  });

  // Seed a parsed batch directly (no worker runs here) so review-stage routes can
  // be exercised without depending on async parsing.
  async function seedParsedBatch(reviewed: Record<string, unknown>) {
    const emp = await db.employee.findFirstOrThrow({ where: { tenantId } });
    return db.bulkImportBatch.create({
      data: {
        tenantId,
        jobId,
        createdById: emp.id,
        status: 'REVIEWING',
        totalItems: 1,
        items: {
          create: {
            fileName: 'seed-cv.pdf',
            fileUrl: '/cv-files/seed-not-on-disk.pdf',
            mimeType: 'application/pdf',
            status: 'PARSED',
            parseStatus: 'DONE',
            parserProvider: 'test',
            parsedData: { hasText: true, chars: 10, parsed: reviewed },
            reviewedData: reviewed,
          },
        },
      },
      include: { items: true },
    });
  }

  it('GET returns a batch with its items (tenant-scoped)', async () => {
    const batch = await seedParsedBatch({ fullName: 'Nguyen Van A', email: 'a@example.com' });

    const res = await request(app)
      .get(`/api/v1/recruitment/bulk-import/${batch.id}`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(batch.id);
    expect(res.body.data.status).toBe('REVIEWING');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].reviewed.email).toBe('a@example.com');
  });

  it('GET returns 404 for an unknown batch', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/bulk-import/c-unknown-batch')
      .set(auth(hrToken));
    expect(res.status).toBe(404);
  });

  it('GET rejects a user without recruitment:bulk_import (403)', async () => {
    const batch = await seedParsedBatch({ fullName: 'X' });
    const res = await request(app)
      .get(`/api/v1/recruitment/bulk-import/${batch.id}`)
      .set(auth(noAccessToken));
    expect(res.status).toBe(403);
  });

  it('PATCH overlays the reviewed draft and changes resolution', async () => {
    const batch = await seedParsedBatch({ fullName: 'Old Name', email: 'old@example.com' });
    const itemId = batch.items[0].id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/bulk-import/${batch.id}/items/${itemId}`)
      .set(auth(hrToken))
      .send({ reviewed: { fullName: 'New Name' }, resolution: 'SKIP' });

    expect(res.status).toBe(200);
    expect(res.body.data.reviewed.fullName).toBe('New Name');
    // Untouched field is preserved by the overlay merge.
    expect(res.body.data.reviewed.email).toBe('old@example.com');
    expect(res.body.data.resolution).toBe('SKIP');
  });

  it('PATCH rejects an empty body (422)', async () => {
    const batch = await seedParsedBatch({ fullName: 'Y' });
    const itemId = batch.items[0].id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/bulk-import/${batch.id}/items/${itemId}`)
      .set(auth(hrToken))
      .send({});

    expect(res.status).toBe(422);
  });

  it('PATCH rejects a user without recruitment:bulk_import (403)', async () => {
    const batch = await seedParsedBatch({ fullName: 'Z' });
    const itemId = batch.items[0].id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/bulk-import/${batch.id}/items/${itemId}`)
      .set(auth(noAccessToken))
      .send({ resolution: 'SKIP' });

    expect(res.status).toBe(403);
  });

  it('DELETE cancels a batch (status CANCELLED)', async () => {
    const batch = await seedParsedBatch({ fullName: 'To Cancel' });

    const res = await request(app)
      .delete(`/api/v1/recruitment/bulk-import/${batch.id}`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');

    const persisted = await db.bulkImportBatch.findUnique({ where: { id: batch.id } });
    expect(persisted?.status).toBe('CANCELLED');
  });

  it('DELETE rejects a user without recruitment:bulk_import (403)', async () => {
    const batch = await seedParsedBatch({ fullName: 'Keep' });
    const res = await request(app)
      .delete(`/api/v1/recruitment/bulk-import/${batch.id}`)
      .set(auth(noAccessToken));
    expect(res.status).toBe(403);
  });

  // ===== Confirm (Task 2.2) =====
  type SeedItem = {
    fileName?: string;
    status?: string;
    parseStatus?: string;
    resolution?: string;
    reviewed?: Record<string, unknown>;
    duplicateOfCandidateId?: string | null;
  };

  async function seedReviewingBatch(items: SeedItem[], status = 'REVIEWING') {
    const emp = await db.employee.findFirstOrThrow({ where: { tenantId } });
    return db.bulkImportBatch.create({
      data: {
        tenantId,
        jobId,
        createdById: emp.id,
        status: status as never,
        totalItems: items.length,
        items: {
          create: items.map((it, idx) => ({
            fileName: it.fileName ?? `seed-${idx}.pdf`,
            fileUrl: `/cv-files/seed-${idx}-not-on-disk.pdf`,
            mimeType: 'application/pdf',
            status: (it.status ?? 'PARSED') as never,
            parseStatus: (it.parseStatus ?? 'DONE') as never,
            resolution: (it.resolution ?? 'NEW') as never,
            parserProvider: 'test',
            parsedData: { hasText: true, chars: 10, parsed: it.reviewed ?? {} },
            reviewedData: it.reviewed ?? {},
            duplicateOfCandidateId: it.duplicateOfCandidateId ?? null,
          })),
        },
      },
      include: { items: true },
    });
  }

  it('confirm creates a candidate + application in the first stage (NEW)', async () => {
    const batch = await seedReviewingBatch([
      { reviewed: { fullName: 'Confirm New', email: 'confirm-new@example.com', skills: ['Node'] } },
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ created: 1, linked: 0, skipped: 0, failed: 0 });
    expect(res.body.data.batch.status).toBe('CONFIRMED');

    const candidate = await db.candidate.findFirst({
      where: { tenantId, email: 'confirm-new@example.com' },
    });
    expect(candidate).not.toBeNull();

    const apps = await db.application.findMany({
      where: { tenantId, jobId, candidateId: candidate!.id },
      include: { currentStage: true },
    });
    expect(apps).toHaveLength(1);
    expect(apps[0].currentStage.type).toBe('SOURCED');

    const item = await db.bulkImportItem.findFirst({ where: { batchId: batch.id } });
    expect(item?.status).toBe('CONFIRMED');
    expect(item?.candidateId).toBe(candidate!.id);
    expect(item?.applicationId).toBe(apps[0].id);
  });

  it('confirm links to an existing candidate without creating a new one (LINK_EXISTING)', async () => {
    const existing = await db.candidate.create({
      data: { tenantId, fullName: 'Existing Link', email: 'existing-link@example.com', source: 'SOURCED' },
    });
    const before = await db.candidate.count({ where: { tenantId } });

    const batch = await seedReviewingBatch([
      {
        resolution: 'LINK_EXISTING',
        duplicateOfCandidateId: existing.id,
        reviewed: { fullName: 'Existing Link', email: 'existing-link@example.com', skills: [] },
      },
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ created: 0, linked: 1, failed: 0 });

    const after = await db.candidate.count({ where: { tenantId } });
    expect(after).toBe(before); // no new candidate

    const apps = await db.application.findMany({ where: { tenantId, jobId, candidateId: existing.id } });
    expect(apps).toHaveLength(1);

    const item = await db.bulkImportItem.findFirst({ where: { batchId: batch.id } });
    expect(item?.status).toBe('CONFIRMED');
    expect(item?.candidateId).toBe(existing.id);
  });

  it('confirm isolates a failing item — siblings still commit', async () => {
    const batch = await seedReviewingBatch([
      { fileName: 'ok.pdf', reviewed: { fullName: 'Isolate OK', email: 'isolate-ok@example.com', skills: [] } },
      // LINK_EXISTING with no target → commitItem throws → item FAILED.
      { fileName: 'bad.pdf', resolution: 'LINK_EXISTING', duplicateOfCandidateId: null, reviewed: { fullName: 'Isolate Bad', skills: [] } },
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ created: 1, failed: 1 });

    const items = await db.bulkImportItem.findMany({
      where: { batchId: batch.id },
      orderBy: { fileName: 'asc' },
    });
    // bad.pdf sorts first
    expect(items[0].status).toBe('FAILED');
    expect(items[0].failureReason).toBe('BULK_ITEM_NO_LINK_TARGET');
    expect(items[1].status).toBe('CONFIRMED');
  });

  it('confirm degrades a raced NEW into a link on a hard email duplicate', async () => {
    const existing = await db.candidate.create({
      data: { tenantId, fullName: 'Race Target', email: 'race@example.com', source: 'SOURCED' },
    });
    const before = await db.candidate.count({ where: { tenantId } });

    // resolution NEW but the email already belongs to an existing candidate.
    const batch = await seedReviewingBatch([
      { reviewed: { fullName: 'Race Dup', email: 'race@example.com', skills: [] } },
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ created: 0, linked: 1, failed: 0 });

    const after = await db.candidate.count({ where: { tenantId } });
    expect(after).toBe(before); // degraded to link, no new candidate

    const item = await db.bulkImportItem.findFirst({ where: { batchId: batch.id } });
    expect(item?.candidateId).toBe(existing.id);
    expect(item?.resolution).toBe('LINK_EXISTING');
  });

  it('confirm skips SKIP-resolution items', async () => {
    const batch = await seedReviewingBatch([
      { resolution: 'SKIP', reviewed: { fullName: 'Skip Me', skills: [] } },
    ]);

    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ created: 0, linked: 0, skipped: 1, failed: 0 });

    const item = await db.bulkImportItem.findFirst({ where: { batchId: batch.id } });
    expect(item?.status).toBe('SKIPPED');
  });

  it('confirm is idempotent under a double-submit — creates candidate + application once', async () => {
    const batch = await seedReviewingBatch([
      { reviewed: { fullName: 'Race Confirm', email: 'race-confirm@example.com', skills: [] } },
    ]);

    // Two confirms fire together (double-click / retry). The atomic claim must let
    // exactly one through so the candidate + application are created only once.
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`).set(auth(hrToken)),
      request(app).post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`).set(auth(hrToken)),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    const loser = r1.status === 400 ? r1 : r2;
    expect(loser.body.error.code).toBe('BULK_BATCH_NOT_REVIEWING');

    const candidates = await db.candidate.findMany({
      where: { tenantId, email: 'race-confirm@example.com' },
    });
    expect(candidates).toHaveLength(1);

    const apps = await db.application.findMany({
      where: { tenantId, jobId, candidateId: candidates[0].id },
    });
    expect(apps).toHaveLength(1);
  });

  it('confirm rejects a batch that is not REVIEWING (400)', async () => {
    const batch = await seedReviewingBatch(
      [{ reviewed: { fullName: 'Draft', skills: [] } }],
      'DRAFT'
    );
    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(hrToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BULK_BATCH_NOT_REVIEWING');
  });

  it('confirm rejects a user without recruitment:bulk_import (403)', async () => {
    const batch = await seedReviewingBatch([{ reviewed: { fullName: 'Blocked', skills: [] } }]);
    const res = await request(app)
      .post(`/api/v1/recruitment/bulk-import/${batch.id}/confirm`)
      .set(auth(noAccessToken));
    expect(res.status).toBe(403);
  });
});
