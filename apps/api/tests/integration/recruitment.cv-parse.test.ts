import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { getCvParseQueue } from '../../src/domain/recruitment/cv-parse.queue.js';
import { createCvParseWorker } from '../../src/domain/recruitment/cv-parse.worker.js';

const TENANT_SLUG = 'recruitment-cvparse-tenant';
const HR_EMAIL = 'hr@recruitment-cvparse.com';
const HR_PASSWORD = 'HrTest@123';

// Sentinel CV text the heuristic parser (no ANTHROPIC_API_KEY in tests) can map
// into structured fields — proves the worker round-trips raw text → suggestion.
const CV_TEXT = [
  'Tran Thi Bich',
  'Senior Backend Engineer',
  'Email: bich.tran@example.com',
  'Phone: 0987 654 321',
  'GitHub: https://github.com/bichtran',
  'Kinh nghiem: 6 nam.',
  'Skills: Node.js, TypeScript, PostgreSQL, Redis, Docker.',
].join('\n');

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
  await db.candidateAttachment.deleteMany({ where: { candidate: { tenantId } } });
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Recruitment API — CV parse worker (hrm.recruitment.cv_parse)', () => {
  let tenantId: string;
  let hrToken: string;
  let candidateId: string;
  let worker: Worker;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment CV Parse Tenant', slug: TENANT_SLUG },
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

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = login.body.data.accessToken;

    const candidate = await db.candidate.create({
      data: { tenantId, fullName: 'Trần Thị Bích', source: 'DIRECT' },
    });
    candidateId = candidate.id;

    await getCvParseQueue().obliterate({ force: true });
    worker = createCvParseWorker();
  });

  afterAll(async () => {
    await worker.close();
    await getCvParseQueue().close();
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await redis.quit();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function listAttachments() {
    const res = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken));
    return res.body.data as Array<{ id: string; parseStatus: string; parsed: unknown }>;
  }

  async function waitForParse(attachmentId: string, target = 'DONE') {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const rows = await listAttachments();
      const row = rows.find((r) => r.id === attachmentId);
      if (row && (row.parseStatus === target || row.parseStatus === 'FAILED')) {
        return row;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for attachment ${attachmentId} to reach ${target}`);
  }

  it('parses an uploaded CV asynchronously and stores a structured suggestion', async () => {
    const pdf = await makePdf(CV_TEXT);

    const upload = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken))
      .attach('file', pdf, 'cv-bich.pdf');

    expect(upload.status).toBe(201);
    // Upload responds before the worker runs — parse is still PENDING here.
    expect(upload.body.data.parseStatus).toBe('PENDING');

    const attachmentId = upload.body.data.id as string;
    const parsed = await waitForParse(attachmentId);

    expect(parsed.parseStatus).toBe('DONE');
    const suggestion = parsed.parsed as {
      email?: string;
      skills: string[];
      links?: { github?: string };
    };
    expect(suggestion).toBeTruthy();
    expect(suggestion.email).toBe('bich.tran@example.com');
    expect(suggestion.skills).toEqual(
      expect.arrayContaining(['Node.js', 'TypeScript', 'PostgreSQL'])
    );
    expect(suggestion.links?.github).toContain('github.com/bichtran');
  });

  it('re-parses an attachment on demand and returns it to PROCESSING', async () => {
    const rows = await listAttachments();
    const attachmentId = rows[0].id;

    const res = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments/${attachmentId}/parse`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.parseStatus).toBe('PROCESSING');

    // The worker drains the re-parse job back to DONE.
    const parsed = await waitForParse(attachmentId);
    expect(parsed.parseStatus).toBe('DONE');
  });
});
